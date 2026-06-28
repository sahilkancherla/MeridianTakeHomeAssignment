import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buildFrozenSpec, type FrozenSpec } from '@meridian/spec';
import { useBoard } from '../store/boardStore';
import { openCount, useComments } from '../store/commentStore';
import { useChat } from '../store/chatStore';
import { useHistory } from '../history/useHistory';
import { useAuth } from '../store/authStore';
import { SubmitDialog } from './SubmitDialog';
import { SpecSummary } from './SpecSummary';
import { ReviewLoadingModal } from './ReviewLoadingModal';
import { insertFrozenSpec, nextSpecVersion } from '../data/processes';

export function Topbar() {
  const processId = useBoard((s) => s.processId);
  const name = useBoard((s) => s.processName);
  const setName = useBoard((s) => s.setProcessName);
  const cards = useBoard((s) => s.cards);
  const edges = useBoard((s) => s.edges);
  const cardCount = cards.length;
  const locked = useBoard((s) => s.locked);
  const readOnly = useBoard((s) => s.readOnly);
  const setReadOnly = useBoard((s) => s.setReadOnly);
  const editLocked = locked || readOnly;

  const runReview = useComments((s) => s.runReview);
  const reviewing = useComments((s) => s.reviewing);
  const comments = useComments((s) => s.comments);
  const annotations = useComments((s) => s.annotations);
  const reviewRound = useComments((s) => s.reviewRound);
  const openComments = useComments((s) => openCount(s.comments));

  const chatOpen = useChat((s) => s.open);
  const toggleChat = useChat((s) => s.toggleOpen);
  const canUndo = useHistory((s) => s.canUndo);
  const canRedo = useHistory((s) => s.canRedo);
  const undo = useHistory((s) => s.undo);
  const redo = useHistory((s) => s.redo);

  // Submit flow: confirm dialog → persist → friendly locked summary (no JSON).
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedSpec, setSubmittedSpec] = useState<FrozenSpec | null>(null);

  const doSubmit = async (overrideReason?: string) => {
    if (!processId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const version = await nextSpecVersion(processId);
      const spec = buildFrozenSpec({
        processName: name,
        cards,
        edges,
        comments,
        annotations,
        createdAt: new Date().toISOString(),
        version,
        reviewRounds: reviewRound,
        overrideReason,
      });
      await insertFrozenSpec(processId, spec);
      setSubmitOpen(false);
      setSubmittedSpec(spec);
      // Submitting locks the board until an engineer unlocks it (handoff §5.4) — but the
      // lock is for customers; an engineer keeps editing.
      if (useAuth.getState().role === 'customer') setReadOnly(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Link to="/" className="topbar__home" title="Back to your whiteboards">
          <span className="topbar__product">Meridian</span>
        </Link>
        <span className="topbar__divider" />
        <span className="topbar__mode">Whiteboard Mode</span>
      </div>

      <div className="topbar__center">
        <input
          className="topbar__name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Process name"
          spellCheck={false}
        />
        <span className="topbar__meta">{cardCount} cards</span>
        {readOnly && (
          <span className="topbar__lock" title="Submitted to your Meridian team — locked until they unlock it">
            🔒 Locked
          </span>
        )}
      </div>

      <div className="topbar__actions">
        <div className="topbar__group" role="group" aria-label="History">
          <button
            type="button"
            className="iconbtn"
            onClick={undo}
            disabled={!canUndo || editLocked}
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={redo}
            disabled={!canRedo || editLocked}
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>

        <button
          type="button"
          className={`btn btn--ghost btn--chat ${chatOpen ? 'is-active' : ''}`}
          onClick={() => toggleChat()}
          disabled={readOnly}
          title="Edit or ask about the canvas in natural language"
        >
          ✦ AI Editor
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--review"
          onClick={runReview}
          disabled={reviewing || readOnly}
          title="Scan the canvas for gaps and leave structured comments"
        >
          {reviewing && <span className="btn__spinner" aria-hidden />}
          {reviewing ? 'Reviewing…' : 'Run AI Review'}
          {!reviewing && openComments > 0 && <span className="btn__count">{openComments}</span>}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setSubmitError(null);
            setSubmitOpen(true);
          }}
          disabled={editLocked || !processId || cardCount === 0}
          title={
            readOnly
              ? 'Already submitted — locked until your Meridian team unlocks it'
              : 'Freeze this whiteboard into an immutable spec and send it to your team'
          }
        >
          Submit
        </button>
      </div>

      {submitOpen && (
        <SubmitDialog
          processName={name}
          openComments={openComments}
          busy={submitting}
          error={submitError}
          onCancel={() => setSubmitOpen(false)}
          onConfirm={doSubmit}
        />
      )}
      {submittedSpec && (
        <SpecSummary spec={submittedSpec} status="submitted" onClose={() => setSubmittedSpec(null)} />
      )}
      {reviewing && <ReviewLoadingModal />}
    </header>
  );
}
