import { useMemo } from 'react';
import { analyze, type ProcessGraph } from '@meridian/spec';
import { useBoard } from './boardStore';
import { unresolvedCount, useComments } from './commentStore';

/**
 * The live semantic schema (whiteboard-spec §6). `analyze()` is pure and cheap, so
 * we recompute the ProcessGraph from the canvas on every change — the graph is
 * never stored, so it can never drift from what's on the board.
 *
 * Open/answered comments and the AI's annotations fold in here too, so the
 * completeness signal reflects the live state of the review loop.
 */
export function useAnalysis(): ProcessGraph {
  const cards = useBoard((s) => s.cards);
  const edges = useBoard((s) => s.edges);
  const annotations = useComments((s) => s.annotations);
  const openComments = useComments((s) => unresolvedCount(s.comments));
  return useMemo(
    () => analyze(cards, edges, { annotations, openComments }),
    [cards, edges, annotations, openComments],
  );
}
