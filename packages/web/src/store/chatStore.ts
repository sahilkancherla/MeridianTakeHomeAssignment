/**
 * AI canvas-editing chat (whiteboard-spec.md §8). In-memory for now, like the
 * comment store — shaped so a Supabase persistence subscriber (the `chat_message`
 * table, §7) can attach later without touching components.
 *
 * Flow: the user types → POST /api/chat with the live graph + recent history → the
 * server answers or returns a validated proposal. A proposal puts the board into
 * read-only PREVIEW (D5); Confirm applies the ops through the shared pure `applyOps`
 * and commits one undo entry; Discard drops it. The server holds the model key and
 * validates; the client owns confirm/discard/undo because op-application is pure (§2).
 */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  applyOps,
  type ChatMessage,
  type ChatRequest,
  type ProposedChange,
} from '@meridian/spec';
import { postChat } from '../data/aiChat';
import { useBoard } from './boardStore';
import { useHistory } from '../history/useHistory';
import { layoutNewCards } from '../canvas/previewDecorations';

const nowISO = () => new Date().toISOString();

export type ChatState = {
  open: boolean;
  messages: ChatMessage[];
  /** The proposal currently previewed on the canvas (null = none). */
  pending: ProposedChange | null;
  sending: boolean;
  error: string | null;

  toggleOpen: (open?: boolean) => void;
  send: (text: string) => Promise<void>;
  confirm: () => void;
  discard: () => void;
  /** Clear the conversation + any pending proposal when switching boards. */
  reset: () => void;
};

export const useChat = create<ChatState>((set, get) => ({
  open: false,
  messages: [],
  pending: null,
  sending: false,
  error: null,

  toggleOpen: (open) => set((s) => ({ open: open ?? !s.open })),

  send: async (text) => {
    const message = text.trim();
    // A proposal is pending → the canvas is locked; resolve it before a new turn (§4).
    if (!message || get().sending || get().pending) return;

    const board = useBoard.getState();
    const userMsg: ChatMessage = {
      id: nanoid(8),
      role: 'user',
      kind: 'chat',
      content: message,
      createdAt: nowISO(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], sending: true, error: null }));

    try {
      const body: ChatRequest = {
        processName: board.processName,
        cards: board.cards,
        edges: board.edges,
        history: get().messages,
        message,
      };
      const res = await postChat(body);

      if (res.kind === 'chat') {
        set((s) => ({
          messages: [...s.messages, assistantChat(res.text)],
        }));
      } else {
        // Flush any pending manual-edit burst so the AI change is its own undo step (§5).
        useHistory.getState().commit();
        set((s) => ({
          messages: [...s.messages, assistantProposal(res.proposal)],
          pending: res.proposal,
        }));
        useBoard.getState().setLocked(true);
      }
    } catch (e) {
      const msg =
        e instanceof TypeError
          ? 'Could not reach the chat API. Is the API server running (pnpm dev:api on :8787)?'
          : e instanceof Error
            ? e.message
            : 'Chat failed';
      set((s) => ({ messages: [...s.messages, assistantChat(`⚠️ ${msg}`)], error: msg }));
    } finally {
      set({ sending: false });
    }
  },

  confirm: () => {
    const proposal = get().pending;
    if (!proposal) return;
    const board = useBoard.getState();
    const { cards, edges, diff } = applyOps(board.cards, board.edges, proposal.ops, {
      remapIds: true,
      genId: () => nanoid(8),
      softDelete: false,
    });
    const laidOut = layoutNewCards(cards, edges, new Set(diff.addedCards));

    board.setLocked(false);
    board.replaceGraph(laidOut, edges);
    // One undo entry for the whole confirmed AI change (§5).
    useHistory.getState().commit();

    set((s) => ({
      pending: null,
      messages: markProposal(s.messages, proposal.id, 'confirmed'),
    }));
  },

  discard: () => {
    const proposal = get().pending;
    if (!proposal) return;
    useBoard.getState().setLocked(false); // committed graph was never touched (D5)
    set((s) => ({
      pending: null,
      messages: markProposal(s.messages, proposal.id, 'discarded'),
    }));
  },

  reset: () => set({ open: false, messages: [], pending: null, sending: false, error: null }),
}));

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

function assistantChat(text: string): ChatMessage {
  return { id: nanoid(8), role: 'assistant', kind: 'chat', content: text, createdAt: nowISO() };
}

function assistantProposal(proposal: ProposedChange): ChatMessage {
  return {
    id: proposal.id,
    role: 'assistant',
    kind: 'proposal',
    content: proposal.summary,
    proposal,
    createdAt: proposal.createdAt,
  };
}

/** Stamp a proposal message's status after the user resolves it (for the transcript). */
function markProposal(messages: ChatMessage[], id: string, status: ProposedChange['status']): ChatMessage[] {
  return messages.map((m) =>
    m.id === id && m.proposal ? { ...m, proposal: { ...m.proposal, status } } : m,
  );
}
