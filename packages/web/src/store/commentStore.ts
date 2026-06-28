import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Annotation, Comment, CommentStatus, ReviewRequest, ReviewResult } from '@meridian/spec';
import { useBoard } from './boardStore';
import { useAuth } from './authStore';
import { apiUrl } from '../data/apiBase';

/** The signed-in user's email, for attributing human comments. */
const myEmail = (): string | null => useAuth.getState().user?.email ?? null;

/**
 * Comments + AI annotations live here, alongside the board (cards/edges) store —
 * in memory for M2. The whole AI-review revision loop runs through these actions.
 * Supabase autosave is a later milestone; like boardStore, this is shaped so a
 * persistence subscriber can attach without touching components.
 *
 * See docs/design/ai-review-spec.md §4.
 */

export const LOCAL_PROCESS_ID = 'local';
export type CommentFilter = CommentStatus | 'all';

const nowISO = () => new Date().toISOString();

export type CommentState = {
  comments: Comment[];
  annotations: Annotation[];
  reviewRound: number;
  reviewing: boolean;
  error: string | null;
  /** Syncs pin ↔ panel highlight. */
  selectedCommentId: string | null;
  filter: CommentFilter;

  /** POST the canvas to /api/review and apply the result (new comments, re-review
   *  verdicts, annotations). */
  runReview: () => Promise<void>;
  /** Author a brand-new top-level comment (any human), pinned to a card or canvas. */
  addComment: (cardId: string | null, body: string) => void;
  /** Reply in-thread: open|resolved → answered. */
  reply: (commentId: string, body: string) => void;
  /** Dismiss as not applicable → rejected (kept for audit; never blocks submit). */
  reject: (commentId: string, reason?: string) => void;
  /** Manually resolve a human-authored thread (AI threads resolve via re-review only). */
  resolve: (commentId: string) => void;
  selectComment: (id: string | null) => void;
  /** Open the comments tab focused on a card's thread (from a canvas pin click). */
  focusCard: (cardId: string) => void;
  setFilter: (f: CommentFilter) => void;

  /** Hydrate from a loaded board. */
  load: (comments: Comment[], annotations: Annotation[]) => void;
  /** Clear when leaving the board. */
  reset: () => void;
};

export const useComments = create<CommentState>((set, get) => ({
  comments: [],
  annotations: [],
  reviewRound: 0,
  reviewing: false,
  error: null,
  selectedCommentId: null,
  filter: 'all',

  runReview: async () => {
    if (get().reviewing) return;
    const board = useBoard.getState();
    const { comments, annotations, reviewRound } = get();
    set({ reviewing: true, error: null });
    try {
      const body: ReviewRequest = {
        processName: board.processName,
        round: reviewRound + 1,
        cards: board.cards,
        edges: board.edges,
        comments,
        annotations,
      };
      const res = await fetch(apiUrl('/api/review'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `Review failed (${res.status})`);
      }
      const result = (await res.json()) as ReviewResult;
      set((s) => applyResult(s, result));
      useBoard.getState().setRightTab('comments');
    } catch (e) {
      // Surface the failure: open the Comments tab so the error banner is visible
      // instead of the click looking like it did nothing (e.g. API server not running).
      const message =
        e instanceof TypeError
          ? 'Could not reach the review API. Is the API server running (pnpm dev:api on :8787)?'
          : e instanceof Error
            ? e.message
            : 'Review failed';
      set({ error: message });
      useBoard.getState().setRightTab('comments');
    } finally {
      set({ reviewing: false });
    }
  },

  addComment: (cardId, body) => {
    const text = body.trim();
    if (!text) return;
    const comment: Comment = {
      id: nanoid(8),
      processId: LOCAL_PROCESS_ID,
      cardId,
      author: 'user',
      authorEmail: myEmail(),
      body: text,
      status: 'open',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    set((s) => ({ comments: [...s.comments, comment], selectedCommentId: comment.id }));
    if (cardId) useBoard.getState().selectCardOnly(cardId);
  },

  reply: (commentId, body) => {
    const text = body.trim();
    if (!text) return;
    set((s) => {
      const parent = s.comments.find((c) => c.id === commentId);
      if (!parent) return s;
      const reply: Comment = {
        id: nanoid(8),
        processId: LOCAL_PROCESS_ID,
        cardId: parent.cardId,
        author: 'user',
        authorEmail: myEmail(),
        body: text,
        status: 'answered',
        parentId: commentId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      // Replying moves the thread into 'answered' (the next review re-evaluates it).
      const comments = s.comments.map((c) =>
        c.id === commentId && (c.status === 'open' || c.status === 'resolved')
          ? { ...c, status: 'answered' as CommentStatus, updatedAt: nowISO() }
          : c,
      );
      return { comments: [...comments, reply], selectedCommentId: commentId };
    });
  },

  reject: (commentId, reason) => {
    set((s) => {
      const parent = s.comments.find((c) => c.id === commentId);
      const extra: Comment[] = [];
      if (reason?.trim()) {
        extra.push({
          id: nanoid(8),
          processId: LOCAL_PROCESS_ID,
          cardId: parent?.cardId ?? null,
          author: 'user',
          authorEmail: myEmail(),
          body: reason.trim(),
          status: 'rejected',
          parentId: commentId,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      }
      const comments = s.comments.map((c) =>
        c.id === commentId ? { ...c, status: 'rejected' as CommentStatus, updatedAt: nowISO() } : c,
      );
      return { comments: [...comments, ...extra] };
    });
  },

  resolve: (commentId) => {
    set((s) => ({
      comments: s.comments.map((c) =>
        c.id === commentId ? { ...c, status: 'resolved' as CommentStatus, updatedAt: nowISO() } : c,
      ),
    }));
  },

  selectComment: (id) => {
    set({ selectedCommentId: id });
    if (id) {
      const c = get().comments.find((x) => x.id === id);
      if (c?.cardId) useBoard.getState().selectCardOnly(c.cardId); // highlight, keep tab
    }
  },

  focusCard: (cardId) => {
    const first = get().comments.find(
      (c) => !c.parentId && c.cardId === cardId && c.status !== 'rejected',
    );
    set({ selectedCommentId: first?.id ?? null });
    useBoard.getState().selectCardOnly(cardId);
    useBoard.getState().setRightTab('comments');
  },

  setFilter: (filter) => set({ filter }),

  load: (comments, annotations) =>
    set({
      comments,
      annotations,
      // Resume review numbering: if the AI has commented before, the next pass is round 2.
      reviewRound: comments.some((c) => c.author === 'ai') ? 1 : 0,
      reviewing: false,
      error: null,
      selectedCommentId: null,
      filter: 'all',
    }),
  reset: () =>
    set({
      comments: [],
      annotations: [],
      reviewRound: 0,
      reviewing: false,
      error: null,
      selectedCommentId: null,
      filter: 'all',
    }),
}));

/** Apply a ReviewResult: append new comments, apply re-review verdicts (with the
 *  AI's note recorded in-thread), and replace the annotation set. */
function applyResult(s: CommentState, result: ReviewResult): Partial<CommentState> {
  let comments = [...s.comments, ...result.newComments];
  const notes: Comment[] = [];
  for (const u of result.statusUpdates) {
    comments = comments.map((c) =>
      c.id === u.commentId ? { ...c, status: u.status, updatedAt: nowISO() } : c,
    );
    if (u.note) {
      const parent = comments.find((c) => c.id === u.commentId);
      notes.push({
        id: nanoid(8),
        processId: LOCAL_PROCESS_ID,
        cardId: parent?.cardId ?? null,
        author: 'ai',
        body: u.note,
        status: u.status,
        parentId: u.commentId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }
  }
  return {
    comments: [...comments, ...notes],
    annotations: result.annotations,
    reviewRound: result.reviewRound,
  };
}

// ---------------------------------------------------------------------------
// Selectors (shared derivations)
// ---------------------------------------------------------------------------

/** Top-level threads (not replies). */
export const threadsOf = (comments: Comment[]): Comment[] => comments.filter((c) => !c.parentId);

/** Open + answered top-level comments = the unresolved ambiguity that feeds the
 *  completeness signal and the review-button badge. */
export const unresolvedCount = (comments: Comment[]): number =>
  comments.filter((c) => !c.parentId && (c.status === 'open' || c.status === 'answered')).length;

/** Strictly-open top-level comments (the submit gate / button badge). */
export const openCount = (comments: Comment[]): number =>
  comments.filter((c) => !c.parentId && c.status === 'open').length;
