import { useEffect } from 'react';
import type { FrozenSpec } from '@meridian/spec';
import { CUSTOMER_STATUS_LABEL, type BuildStatus } from '../data/specs';

/**
 * The customer's view of a submitted spec: a 🔒 lock, the handoff status, and a
 * plain-language summary projected from the frozen object. NO raw JSON, findings, or
 * confidence scores — those are implementation-facing (the engineer's SpecJsonView).
 * See docs/design/submit-and-handoff-spec.md §4.3.
 */
export function SpecSummary({
  spec,
  status = 'submitted',
  onClose,
}: {
  spec: FrozenSpec;
  status?: BuildStatus;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trigger = spec.cards.find((c) => c.type === 'trigger');
  const startsWhen =
    (trigger && (trigger.description || ('source' in trigger && trigger.source) || trigger.label)) || null;
  const branches = spec.cards.filter((c) => c.type === 'branch').length;
  const dispositions = spec.outcomes.map((o) => o.disposition).filter(Boolean);

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel specsum-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="specsum__hero">
          <div className="specsum__lock" aria-hidden>🔒</div>
          <div className="specsum__herotext">
            <div className="specsum__eyebrow">Submitted to your Meridian team</div>
            <h2 className="specsum__title">{spec.processName}</h2>
            <span className={`pill build-pill build-pill--${status}`}>
              v{spec.version} · {CUSTOMER_STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        <div className="specsum__stats">
          <Stat label="version" value={`v${spec.version}`} />
          <Stat label={`step${spec.cards.length === 1 ? '' : 's'}`} value={spec.cards.length} />
          <Stat label={`branch${branches === 1 ? '' : 'es'}`} value={branches} />
          <Stat label={`outcome${spec.outcomes.length === 1 ? '' : 's'}`} value={spec.outcomes.length} />
        </div>

        <div className="specsum__body scroll-thin">
          {(startsWhen || dispositions.length > 0) && (
            <dl className="specsum__rows">
              {startsWhen && (
                <div className="specsum__row">
                  <dt>Starts when</dt>
                  <dd>{startsWhen}</dd>
                </div>
              )}
              {dispositions.length > 0 && (
                <div className="specsum__row">
                  <dt>Ends in</dt>
                  <dd>{dispositions.join(' · ')}</dd>
                </div>
              )}
            </dl>
          )}

          {spec.resolvedAssumptions.length > 0 && (
            <section className="specsum__sec">
              <h3 className="specsum__h">
                Assumptions resolved together
                <span className="specsum__count">{spec.resolvedAssumptions.length}</span>
              </h3>
              <ul className="specsum__assumptions">
                {spec.resolvedAssumptions.map((a) => (
                  <li key={a.commentId} className={a.status === 'rejected' ? 'is-rejected' : ''}>
                    <div className="specsum__q">{a.question}</div>
                    {a.resolution && <div className="specsum__a">{a.resolution}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="specsum__foot">
          <p className="specsum__note">
            This version is locked while your team builds. They can unlock it if you need to make changes.
          </p>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="specsum__stat">
      <span className="specsum__statv">{value}</span>
      <span className="specsum__statk">{label}</span>
    </div>
  );
}
