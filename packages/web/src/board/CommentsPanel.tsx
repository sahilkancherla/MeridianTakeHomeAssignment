import { useState } from 'react';
import type { Comment, CommentStatus } from '@meridian/spec';
import { useBoard } from '../store/boardStore';
import { useComments, type CommentFilter } from '../store/commentStore';
import { useAuth } from '../store/authStore';

/**
 * The Figma-style comments side panel (docs/design/ai-review-spec.md §5.2).
 * Lists threads, filterable by status, synced with the canvas pins by selection.
 * Any human can author a new comment (pinned to the selected card, or canvas-level),
 * reply (open→answered), reject, or — for human threads — resolve. AI-raised threads
 * still resolve via the next review pass (decision #5).
 */

const FILTERS: CommentFilter[] = ['all', 'open', 'answered', 'resolved', 'rejected'];
const STATUS_LABEL: Record<CommentStatus, string> = {
  open: 'Open',
  answered: 'Answered',
  rejected: 'Rejected',
  resolved: 'Resolved',
};

type AuthorKind = 'ai' | 'meridian' | 'member';

/** Identify + color-code a comment's author. Meridian engineers are detected by their
 *  @usemeridian.io email; everyone else with an email is an org member; author 'ai' is
 *  the review agent. */
function authorMeta(c: Comment, myEmail: string | null | undefined): { kind: AuthorKind; label: string } {
  if (c.author === 'ai') return { kind: 'ai', label: 'AI review' };
  const email = c.authorEmail ?? null;
  const isMeridian = !!email && email.toLowerCase().endsWith('@usemeridian.io');
  const isMe = !!email && email === myEmail;
  const label = (email ?? 'Teammate') + (isMe ? ' (you)' : '');
  return { kind: isMeridian ? 'meridian' : 'member', label };
}

const KIND_TAG: Record<AuthorKind, string> = { ai: 'AI', meridian: 'Meridian', member: 'Org member' };

export function CommentsPanel() {
  const comments = useComments((s) => s.comments);
  const filter = useComments((s) => s.filter);
  const setFilter = useComments((s) => s.setFilter);
  const error = useComments((s) => s.error);
  const reviewRound = useComments((s) => s.reviewRound);
  const cards = useBoard((s) => s.cards);
  const myEmail = useAuth((s) => s.user?.email);

  const cardLabel = (id: string | null): string | null =>
    id ? cards.find((c) => c.id === id)?.label || 'Untitled card' : null;

  const threads = comments.filter((c) => !c.parentId);
  const visible = threads.filter((t) => filter === 'all' || t.status === filter);
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const count = (f: CommentFilter) =>
    f === 'all' ? threads.length : threads.filter((t) => t.status === f).length;

  return (
    <div className="comments scroll-thin">
      <NewCommentComposer />

      {threads.length > 0 && (
        <div className="comments__filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`cfilter ${filter === f ? 'is-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
              <span className="cfilter__count">{count(f)}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="comments__error comments__error--inline">{error}</div>}
      {reviewRound > 0 && <div className="comments__round">Reviewed · round {reviewRound}</div>}

      {threads.length === 0 ? (
        <div className="comments__emptybox">
          <span className="comments__emptymark">✦</span>
          <p>No comments yet.</p>
          <p className="comments__emptysub">
            Add a comment above, or click <strong>Run AI Review</strong> to have the agent scan the
            canvas for gaps.
          </p>
        </div>
      ) : (
        <ul className="comments__list">
          {visible.map((t) => (
            <CommentThread
              key={t.id}
              thread={t}
              replies={repliesOf(t.id)}
              cardLabel={cardLabel(t.cardId)}
              myEmail={myEmail}
            />
          ))}
          {visible.length === 0 && <li className="comments__none">No {filter} comments.</li>}
        </ul>
      )}
    </div>
  );
}

/** Author a brand-new comment, pinned to the selected card (or canvas-level). */
function NewCommentComposer() {
  const selectedCardId = useBoard((s) => s.selectedCardId);
  const card = useBoard((s) => s.cards.find((c) => c.id === s.selectedCardId));
  const addComment = useComments((s) => s.addComment);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  const target = card ? `📌 ${card.label || 'Untitled card'}` : 'the canvas';

  const submit = () => {
    addComment(selectedCardId, draft);
    setDraft('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="comments__addbtn" onClick={() => setOpen(true)}>
        <span className="comments__addicon" aria-hidden>+</span>
        Add a comment
      </button>
    );
  }

  return (
    <div className="comments__newbox">
      <div className="comments__newtarget">Commenting on {target}</div>
      <textarea
        className="control control--area control--sm"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={card ? 'Add a note or question about this card…' : 'Add a note or question about the process…'}
      />
      <div className="comment__composer-actions">
        <button type="button" className="btn btn--ghost btn--xs" onClick={() => { setOpen(false); setDraft(''); }}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary btn--xs" onClick={submit} disabled={!draft.trim()}>
          Comment
        </button>
      </div>
    </div>
  );
}

function CommentThread({
  thread,
  replies,
  cardLabel,
  myEmail,
}: {
  thread: Comment;
  replies: Comment[];
  cardLabel: string | null;
  myEmail: string | null | undefined;
}) {
  const selected = useComments((s) => s.selectedCommentId === thread.id);
  const selectComment = useComments((s) => s.selectComment);
  const reply = useComments((s) => s.reply);
  const reject = useComments((s) => s.reject);
  const resolve = useComments((s) => s.resolve);
  const [mode, setMode] = useState<'none' | 'reply' | 'reject'>('none');
  const [draft, setDraft] = useState('');

  const canReply = thread.status !== 'rejected';
  const canReject = thread.status === 'open' || thread.status === 'answered';
  // Human-authored threads can be resolved by hand (AI resolves its own via re-review).
  const canResolve = thread.author === 'user' && (thread.status === 'open' || thread.status === 'answered');

  const author = authorMeta(thread, myEmail);

  const submit = () => {
    if (mode === 'reply') reply(thread.id, draft);
    else if (mode === 'reject') reject(thread.id, draft || undefined);
    setDraft('');
    setMode('none');
  };

  return (
    <li
      className={`comment comment--${thread.status} comment--by-${author.kind} ${selected ? 'is-selected' : ''}`}
      onClick={() => selectComment(thread.id)}
    >
      <div className="comment__top">
        <span className={`comment__status comment__status--${thread.status}`}>
          {STATUS_LABEL[thread.status]}
        </span>
        {thread.category && <span className="comment__cat">{thread.category.replace('_', ' ')}</span>}
        <span className={`comment__author comment__author--${author.kind}`}>
          <span className="comment__authortag">{KIND_TAG[author.kind]}</span>
          {author.label}
        </span>
      </div>

      {cardLabel ? (
        <span className="comment__pin">📌 {cardLabel}</span>
      ) : (
        <span className="comment__pin comment__pin--canvas">General</span>
      )}

      <p className="comment__body">{thread.body}</p>

      {replies.length > 0 && (
        <ul className="comment__replies">
          {replies.map((r) => {
            const ra = authorMeta(r, myEmail);
            return (
              <li key={r.id} className={`reply reply--by-${ra.kind}`}>
                <span className={`reply__author reply__author--${ra.kind}`} title={`${KIND_TAG[ra.kind]} · ${ra.label}`}>
                  {ra.label}
                </span>
                <span className="reply__body">{r.body}</span>
              </li>
            );
          })}
        </ul>
      )}

      {mode === 'none' ? (
        <div className="comment__actions" onClick={(e) => e.stopPropagation()}>
          {canReply && (
            <button type="button" className="linkbtn" onClick={() => setMode('reply')}>
              Reply
            </button>
          )}
          {canResolve && (
            <button type="button" className="linkbtn" onClick={() => resolve(thread.id)}>
              Resolve
            </button>
          )}
          {canReject && (
            <button type="button" className="linkbtn linkbtn--muted" onClick={() => setMode('reject')}>
              Reject
            </button>
          )}
        </div>
      ) : (
        <div className="comment__composer" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="control control--area control--sm"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={mode === 'reply' ? 'Answer the question, or note the canvas edit you made…' : 'Optional: why is this not applicable?'}
          />
          <div className="comment__composer-actions">
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => { setMode('none'); setDraft(''); }}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn--xs ${mode === 'reject' ? 'btn--danger-solid' : 'btn--primary'}`}
              onClick={submit}
              disabled={mode === 'reply' && !draft.trim()}
            >
              {mode === 'reply' ? 'Send reply' : 'Reject comment'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
