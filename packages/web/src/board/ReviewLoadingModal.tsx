import { useEffect, useState } from 'react';

/**
 * A small blocking modal shown while an AI review is in flight. The review call can
 * take a while (a real model pass over the whole canvas), so this replaces the bare
 * button spinner with a clear "working…" state, an indeterminate progress bar, and a
 * rotating note of what the reviewer is doing. It auto-closes when `reviewing` flips
 * false (the comments land in the Comments tab).
 */
const STEPS = [
  'Re-deriving the process graph from the canvas…',
  'Scanning for structural gaps and missing paths…',
  'Checking data flow — what each step needs and produces…',
  'Looking for ambiguous rules and undefined terms…',
  'Re-reviewing your answers from earlier rounds…',
  'Writing up structured comments…',
];

export function ReviewLoadingModal() {
  const [step, setStep] = useState(0);

  // Advance the note every ~1.8s; hold on the last one until the call returns.
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="modal" role="alertdialog" aria-busy="true" aria-label="Running AI review">
      <div className="modal__panel reviewmodal" onClick={(e) => e.stopPropagation()}>
        <div className="reviewmodal__spinner" aria-hidden />
        <div className="reviewmodal__eyebrow">AI Review</div>
        <h2 className="reviewmodal__title">Scanning your whiteboard…</h2>
        <p className="reviewmodal__step">{STEPS[step]}</p>
        <div className="reviewmodal__bar" aria-hidden>
          <span className="reviewmodal__barfill" />
        </div>
        <p className="reviewmodal__hint">This usually takes a few seconds. Comments appear when it’s done.</p>
      </div>
    </div>
  );
}
