import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Card, Edge, PrimitiveType } from '@meridian/spec';
import { makeCard } from '../primitives/catalog';

/**
 * The board is the single source of truth for the canvas: the list of cards
 * (primitives) and edges (connections), plus the current selection. React Flow
 * renders a derived view of this; user gestures flow back through these actions.
 *
 * The store holds ONE open board at a time. `load()` hydrates it from Supabase when
 * a board route opens; a debounced subscriber (data/persistence.ts) writes changes
 * back. `reset()` clears it when leaving the board.
 */

export type RightTab = 'inspector' | 'comments';

export type BoardState = {
  /** The open whiteboard's process id (null when no board is loaded). */
  processId: string | null;
  processName: string;
  cards: Card[];
  edges: Edge[];
  selectedCardId: string | null;
  /** Which view the right pane shows. Defaults to the inspector; selecting a card
   *  keeps it there, and running an AI review flips it to comments. */
  rightTab: RightTab;
  /** Read-only lock while an AI edit proposal is previewed (ai-canvas-editing §4/§5,
   *  D5): manual edits and undo/redo are disabled until the user resolves it. */
  locked: boolean;
  /** Submission lock: the board was submitted and is read-only until an engineer
   *  unlocks it (submit-and-handoff-spec §5.4). Distinct from `locked` (AI preview);
   *  editing is disabled when either is true. */
  readOnly: boolean;

  addCard: (type: PrimitiveType, position: { x: number; y: number }) => void;
  updateCard: (id: string, patch: Partial<Card>) => void;
  moveCard: (id: string, position: { x: number; y: number }) => void;
  removeCard: (id: string) => void;

  connect: (sourceId: string, targetId: string, sourceHandle?: string | null) => void;
  removeEdge: (id: string) => void;

  /** Atomically replace the whole graph. The single write path used by AI-edit
   *  confirm and by undo/redo, so the canvas, autosave, and derived ProcessGraph
   *  stay consistent (ai-canvas-editing §5). */
  replaceGraph: (cards: Card[], edges: Edge[]) => void;
  setLocked: (locked: boolean) => void;
  setReadOnly: (readOnly: boolean) => void;

  selectCard: (id: string | null) => void;
  /** Select a card without changing the right tab — used to highlight the card a
   *  comment is pinned to while staying on the Comments tab. */
  selectCardOnly: (id: string | null) => void;
  setProcessName: (name: string) => void;
  setRightTab: (tab: RightTab) => void;

  /** Hydrate the store from a loaded board (data/processes.ts loadBoard). */
  load: (data: { id: string; name: string; cards: Card[]; edges: Edge[]; locked?: boolean }) => void;
  /** Clear the open board (on leaving the board route). */
  reset: () => void;
};

export const useBoard = create<BoardState>((set, get) => ({
  processId: null,
  processName: '',
  cards: [],
  edges: [],
  selectedCardId: null,
  rightTab: 'inspector',
  locked: false,
  readOnly: false,

  addCard: (type, position) => {
    const card = makeCard(type, nanoid(8), position);
    set((s) => ({ cards: [...s.cards, card], selectedCardId: card.id }));
  },

  updateCard: (id, patch) => {
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? ({ ...c, ...patch } as Card) : c)),
    }));
  },

  moveCard: (id, position) => {
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, position } : c)) }));
  },

  removeCard: (id) => {
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedCardId: s.selectedCardId === id ? null : s.selectedCardId,
    }));
  },

  connect: (sourceId, targetId, sourceHandle) => {
    if (sourceId === targetId) return;
    const src = get().cards.find((c) => c.id === sourceId);
    if (!src) return;

    // Edge meaning is derived from the source card, so the user never labels edges
    // by hand: an Exception card emits dashed loop-back edges; a Branch handle id is the
    // path label the edge carries.
    const kind: Edge['kind'] = src.type === 'exception' ? 'exception' : 'flow';
    const fansOut = src.type === 'branch';
    const branchLabel = fansOut && sourceHandle ? sourceHandle : undefined;

    const exists = get().edges.some(
      (e) => e.source === sourceId && e.target === targetId && e.branchLabel === branchLabel,
    );
    if (exists) return;

    const edge: Edge = { id: nanoid(8), source: sourceId, target: targetId, kind, branchLabel };
    set((s) => ({ edges: [...s.edges, edge] }));
  },

  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

  replaceGraph: (cards, edges) =>
    set((s) => ({
      cards,
      edges,
      // Drop the selection if the card it pointed at is gone (e.g. an AI deletion).
      selectedCardId: s.selectedCardId && cards.some((c) => c.id === s.selectedCardId) ? s.selectedCardId : null,
    })),

  setLocked: (locked) => set({ locked }),
  setReadOnly: (readOnly) => set({ readOnly }),

  // Selecting a card surfaces its inspector; deselecting leaves the tab as-is.
  selectCard: (id) => set((s) => ({ selectedCardId: id, rightTab: id ? 'inspector' : s.rightTab })),
  selectCardOnly: (id) => set({ selectedCardId: id }),
  setProcessName: (name) => set({ processName: name }),
  setRightTab: (tab) => set({ rightTab: tab }),

  load: ({ id, name, cards, edges, locked }) =>
    set({
      processId: id,
      processName: name,
      cards,
      edges,
      selectedCardId: null,
      locked: false,
      readOnly: !!locked,
      rightTab: 'inspector',
    }),
  reset: () =>
    set({ processId: null, processName: '', cards: [], edges: [], selectedCardId: null, locked: false, readOnly: false }),
}));
