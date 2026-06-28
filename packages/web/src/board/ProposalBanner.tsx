import { summarizeOps, type ProposedChange } from '@meridian/spec';
import { useChat } from '../store/chatStore';

/**
 * The "Proposed: +2 cards, +3 edges" banner with a single Confirm / Discard
 * (whiteboard-spec §8.4, decision D2). Used inline in the chat thread and as a
 * floating bar over the canvas while a proposal is pending.
 */
export function ProposalBanner({ proposal, variant = 'chat' }: { proposal: ProposedChange; variant?: 'chat' | 'canvas' }) {
  const confirm = useChat((s) => s.confirm);
  const discard = useChat((s) => s.discard);

  return (
    <div className={`pbanner pbanner--${variant}`}>
      <span className="pbanner__summary">
        <span className="pbanner__dot" aria-hidden />
        Proposed: {summarizeOps(proposal.ops)}
      </span>
      <div className="pbanner__actions">
        <button type="button" className="btn btn--primary btn--xs" onClick={confirm}>
          Confirm
        </button>
        <button type="button" className="btn btn--ghost btn--xs" onClick={discard} title="Discard the proposed change">
          Discard
        </button>
      </div>
    </div>
  );
}
