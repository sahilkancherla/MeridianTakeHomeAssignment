import { useState } from 'react';
import { Modal } from '../components/common/Modal';

/**
 * Customer Submit confirmation. With zero open comments it's a one-click freeze; with
 * open comments it requires a reason (the §11 override path), which is recorded in the
 * spec's sourceMeta — the customer is never hard-blocked, but unresolved ambiguity is
 * logged. See docs/design/submit-and-handoff-spec.md §3.3.
 */
export function SubmitDialog({
  processName,
  openComments,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  processName: string;
  openComments: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (overrideReason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const blocked = openComments > 0 && !reason.trim();

  return (
    <Modal
      title="Submit to your Meridian team"
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Keep editing
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onConfirm(reason.trim() || undefined)}
            disabled={busy || blocked}
          >
            {busy ? 'Submitting…' : 'Submit & lock 🔒'}
          </button>
        </>
      }
    >
      <p className="confirm__body">
        Submit <strong>{processName}</strong> to your Meridian team? Once you submit, this version is
        locked and sent to the team to build your agent. You can keep editing and submit a new version
        anytime.
      </p>

      {openComments > 0 && (
        <div className="submit-warn">
          <p className="submit-warn__head">
            ⚠ {openComments} comment{openComments === 1 ? ' is' : 's are'} still open.
          </p>
          <label className="field">
            <span className="field__label">Reason for submitting anyway</span>
            <textarea
              className="control control--area"
              value={reason}
              autoFocus
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. these are edge cases we'll handle in a later revision"
            />
          </label>
        </div>
      )}

      {error && <div className="auth__msg auth__msg--error">{error}</div>}
    </Modal>
  );
}
