/**
 * The frozen, immutable spec — the contract handed to the coding agent.
 * See docs/design/design-doc.md §7. Once written, never mutated; re-submit creates a
 * new version with a new specId.
 */

import type { Card, Edge } from './primitives.js';

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
