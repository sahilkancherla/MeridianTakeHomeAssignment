/**
 * Debounced autosave for the open board. Attached by the board route AFTER the
 * stores are hydrated (so loading a board doesn't immediately re-save it), and
 * detached on leave. Graph, name, and comments each debounce independently and
 * write back through the data layer; RLS guarantees writes hit only the owner's rows.
 */
import { useBoard } from '../store/boardStore';
import { useComments } from '../store/commentStore';
import { renameProcess, saveComments, saveGraph } from './processes';

const DEBOUNCE_MS = 700;

export function attachBoardAutosave(processId: string): () => void {
  let graphTimer: ReturnType<typeof setTimeout> | undefined;
  let nameTimer: ReturnType<typeof setTimeout> | undefined;
  let commentTimer: ReturnType<typeof setTimeout> | undefined;

  const log = (label: string) => (e: unknown) => console.error(`autosave (${label}) failed`, e);

  const unsubBoard = useBoard.subscribe((s, prev) => {
    if (s.processId !== processId) return; // a different board is now open
    if (s.cards !== prev.cards || s.edges !== prev.edges) {
      clearTimeout(graphTimer);
      graphTimer = setTimeout(() => {
        const b = useBoard.getState();
        saveGraph(processId, b.cards, b.edges).catch(log('graph'));
      }, DEBOUNCE_MS);
    }
    if (s.processName !== prev.processName) {
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => {
        renameProcess(processId, useBoard.getState().processName).catch(log('name'));
      }, DEBOUNCE_MS);
    }
  });

  const unsubComments = useComments.subscribe((s, prev) => {
    if (s.comments !== prev.comments || s.annotations !== prev.annotations) {
      clearTimeout(commentTimer);
      commentTimer = setTimeout(() => {
        const c = useComments.getState();
        saveComments(processId, c.comments, c.annotations).catch(log('comments'));
      }, DEBOUNCE_MS);
    }
  });

  return () => {
    clearTimeout(graphTimer);
    clearTimeout(nameTimer);
    clearTimeout(commentTimer);
    unsubBoard();
    unsubComments();
  };
}
