/**
 * Comment & revision model — see docs/design/ai-review-spec.md §1.
 */

export const COMMENT_STATUSES = ['open', 'answered', 'rejected', 'resolved'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const COMMENT_CATEGORIES = [
  'missing_info',
  'ambiguity',
  'structure',
  'inconsistency',
] as const;
export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];

export type Comment = {
  id: string;
  processId: string;
  /** Pinned card; null = canvas-level comment. */
  cardId: string | null;
  author: 'ai' | 'user';
  /** Email of the human who wrote it (null for AI comments) — attribution in a
   *  multi-user org so a teammate's comment isn't shown as "You". */
  authorEmail?: string | null;
  body: string;
  status: CommentStatus;
  category?: CommentCategory;
  /** Threaded replies. */
  parentId?: string;
  createdAt: string;
  updatedAt: string;
};
