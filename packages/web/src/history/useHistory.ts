/**
 * Unified, in-memory undo/redo for the board session (whiteboard-spec §8.5, D3).
 *
 * One snapshot stack covers BOTH manual edits and confirmed AI edits:
 *  - a confirmed AI change is one `replaceGraph` write → exactly one undo step;
 *  - manual edits are coalesced into one step per debounced burst (so dragging a card
 *    is a single undo, not twenty).
 *
 * Model: snapshot-based. Each entry is `{ cards, edges }`; undo/redo restores a
 * snapshot back through the normal write path (`replaceGraph`), so the canvas and the
 * derived ProcessGraph stay consistent. In-memory per session; depth-capped.
 */
import { create } from 'zustand';
import type { Card, Edge } from '@meridian/spec';
import { useBoard } from '../store/boardStore';

type Snapshot = { cards: Card[]; edges: Edge[] };

const CAP = 50;
const DEBOUNCE_MS = 400;

const snapshot = (): Snapshot => {
  const s = useBoard.getState();
  return { cards: s.cards, edges: s.edges };
};

// Compare structure (incl. positions — moving a card is undoable); cheap for board sizes.
const sameGraph = (a: Snapshot, b: Snapshot): boolean =>
  a.cards === b.cards && a.edges === b.edges
    ? true
    : JSON.stringify(a.cards) === JSON.stringify(b.cards) && JSON.stringify(a.edges) === JSON.stringify(b.edges);

type HistoryState = {
  past: Snapshot[];
  future: Snapshot[];
  canUndo: boolean;
  canRedo: boolean;
  /** Flush any pending burst into a history entry. */
  commit: () => void;
  undo: () => void;
  redo: () => void;
  /** Reset the stack + baseline to the current board (on load / board switch). */
  reset: () => void;
};

// Internals kept off the store so they don't trigger React re-renders.
let baseline: Snapshot = snapshot();
let applying = false; // true while WE are writing (undo/redo) — don't checkpoint those
let timer: ReturnType<typeof setTimeout> | null = null;

export const useHistory = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  commit: () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const cur = snapshot();
    if (sameGraph(cur, baseline)) return;
    const past = [...get().past, baseline].slice(-CAP);
    baseline = cur;
    set({ past, future: [], canUndo: true, canRedo: false });
  },

  undo: () => {
    get().commit(); // fold any in-flight manual burst in first
    const { past, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    const cur = snapshot();
    baseline = prev;
    applying = true;
    useBoard.getState().replaceGraph(prev.cards, prev.edges);
    applying = false;
    const nextPast = past.slice(0, -1);
    set({
      past: nextPast,
      future: [cur, ...future].slice(0, CAP),
      canUndo: nextPast.length > 0,
      canRedo: true,
    });
  },

  redo: () => {
    const { past, future } = get();
    if (!future.length) return;
    const next = future[0]!;
    const cur = snapshot();
    baseline = next;
    applying = true;
    useBoard.getState().replaceGraph(next.cards, next.edges);
    applying = false;
    const nextFuture = future.slice(1);
    set({
      past: [...past, cur].slice(-CAP),
      future: nextFuture,
      canUndo: true,
      canRedo: nextFuture.length > 0,
    });
  },

  reset: () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    baseline = snapshot();
    set({ past: [], future: [], canUndo: false, canRedo: false });
  },
}));

// One subscription drives manual-edit checkpointing. Graph changes settle into a single
// entry after a quiet period; selection/tab/lock changes are ignored (commit no-ops when
// the graph is unchanged). Writes we make ourselves (undo/redo) are skipped via `applying`.
useBoard.subscribe((s, prev) => {
  if (applying) return;
  if (s.cards === prev.cards && s.edges === prev.edges) return; // not a graph change
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => useHistory.getState().commit(), DEBOUNCE_MS);
});
