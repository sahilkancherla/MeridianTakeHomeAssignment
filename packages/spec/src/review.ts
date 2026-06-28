/**
 * The AI-review wire contract — see docs/design/ai-review-spec.md §2.
 *
 * `ReviewRequest` is what the web app POSTs to the API server; `ReviewResult` is
 * what comes back. Both live here (not in the web or api package) so the two ends
 * can never drift. The server re-derives the ProcessGraph from `cards`/`edges` with
 * the shared `analyze()` — it trusts the client for *content*, not for analysis.
 */

import type { Card, Edge } from './primitives.js';
import type { Comment, CommentCategory } from './comments.js';
import type { Annotation } from './process-graph.js';

export type ReviewRequest = {
  processName: string;
  /** The round being requested (= prior round + 1). Used for the fixture key and
   *  echoed back, so the demo replays deterministically. */
  round: number;
  cards: Card[];
  edges: Edge[];
  /** Existing threads — drives re-review (answered → resolved / reopened). */
  comments: Comment[];
  /** Prior AI annotations — gives the pass memory of what was uncertain last time. */
  annotations: Annotation[];
};

/** A comment as the model proposes it — the server stamps id/status/author/timestamps,
 *  so the model can never invent those. */
export type DraftComment = {
  cardId: string | null; // pinned card, or null = canvas-level
  category: CommentCategory;
  body: string;
};

/** A re-review verdict on an existing comment. The AI is the only authority for the
 *  resolved/open transition out of `answered` (design decision #5). */
export type StatusUpdate = {
  commentId: string;
  status: 'resolved' | 'open';
  /** One-line rationale, appended to the thread as an AI reply. */
  note?: string;
};

/** The model's raw output, forced into this shape by structured output. */
export type ReviewDraft = {
  newComments: DraftComment[];
  statusUpdates: StatusUpdate[];
  annotations: Annotation[];
};

/** The assembled result the web app applies: real comments with ids + statuses. */
export type ReviewResult = {
  reviewRound: number;
  newComments: Comment[];
  statusUpdates: StatusUpdate[];
  annotations: Annotation[];
};
