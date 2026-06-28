/**
 * The frozen, immutable spec — the contract handed to the coding agent.
 * See docs/design/whiteboard-spec.md §11. Once written, never mutated; re-submit creates a
 * new version with a new specId.
 */

import type { Card, Edge } from './primitives.js';
import type { Annotation, DerivedGraph } from './process-graph.js';

export type ResolvedAssumption = {
  commentId: string;
  cardId: string | null;
  question: string;
  resolution: string;
  status: 'resolved' | 'rejected';
};

export type FrozenSpec = {
  specId: string;
  version: number;
  createdAt: string;
  processName: string;

  cards: Card[];
  edges: Edge[];

  /**
   * The analyzed semantic graph, captured at submit (whiteboard-spec §6.6): the
   * derived, position-free schema (entry, terminals, normalized branches, facts,
   * findings, completeness) plus the AI annotations. This is what the coding agent
   * compiles from — it receives facts and branches, not just raw cards.
   */
  graph: DerivedGraph & { annotations: Annotation[] };

  /** Every comment thread that shaped the spec (the "why"). */
  resolvedAssumptions: ResolvedAssumption[];

  /** Enumerated terminal states. */
  outcomes: { id: string; disposition: string }[];

  sourceMeta: {
    reviewRounds: number;
    openCommentsAtSubmit: number;
    /** Reason captured if submitted with open comments still outstanding. */
    overrideReason?: string;
  };
};
