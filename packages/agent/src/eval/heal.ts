/**
 * The self-heal **controller** — the deterministic guardrail that decides whether the
 * coding agent may run another round. Stop conditions live here, in code, rather than
 * being left to the model's discretion, so "fails consistently → loops forever" can't
 * happen: after each eval round the skill records the result and obeys the verdict.
 *
 * Stop conditions:
 *   • success     — all cases pass.
 *   • cycle       — handlers.ts matches an earlier round (the model is thrashing).
 *   • max_rounds  — the hard round cap was reached.
 *   • plateau     — no improvement in the pass count over the last N rounds.
 * Otherwise: continue. The verdict also flags a regression below the best round so the
 * loop never ends worse than the best state it reached.
 */

export type RoundRecord = {
  round: number;
  passed: number;
  total: number;
  /** Hash of the handlers source at this round — used for cycle detection. */
  handlersHash: string;
};

export type HealState = { rounds: RoundRecord[] };

export type HealLimits = {
  /** Hard cap on rounds (default 6). */
  maxRounds: number;
  /** Stop if the pass count hasn't improved across this many consecutive rounds (default 2). */
  plateauWindow: number;
};

export type HealStopReason = 'success' | 'cycle' | 'max_rounds' | 'plateau';

export type HealVerdict = {
  decision: 'continue' | 'stop';
  reason: HealStopReason | 'in_progress';
  message: string;
  round: number;
  passed: number;
  total: number;
  best: number;
  /** True when this round passes fewer cases than the best round so far. */
  regressedFromBest: boolean;
};

export const DEFAULT_LIMITS: HealLimits = { maxRounds: 6, plateauWindow: 2 };

export function evaluateHeal(state: HealState, limits: HealLimits = DEFAULT_LIMITS): HealVerdict {
  const rounds = state.rounds;
  const last = rounds[rounds.length - 1];
  if (!last) throw new Error('evaluateHeal: no rounds recorded yet.');

  const best = Math.max(...rounds.map((r) => r.passed));
  const regressedFromBest = last.passed < best;
  const base = { round: last.round, passed: last.passed, total: last.total, best, regressedFromBest };
  const stop = (reason: HealStopReason, message: string): HealVerdict => ({ decision: 'stop', reason, message, ...base });

  if (last.total > 0 && last.passed === last.total) {
    return stop('success', `All ${last.total} eval cases pass.`);
  }
  if (rounds.slice(0, -1).some((r) => r.handlersHash === last.handlersHash)) {
    return stop('cycle', 'handlers are identical to an earlier round — the loop is repeating an edit. Escalate.');
  }
  if (last.round >= limits.maxRounds) {
    return stop('max_rounds', `Hit the ${limits.maxRounds}-round cap at ${last.passed}/${last.total} passing. Escalate.`);
  }
  if (rounds.length > limits.plateauWindow) {
    const window = rounds.slice(-(limits.plateauWindow + 1));
    if (window.every((r) => r.passed === window[0]!.passed)) {
      return stop('plateau', `No improvement in ${limits.plateauWindow} rounds (stuck at ${last.passed}/${last.total}). Escalate.`);
    }
  }
  return {
    decision: 'continue',
    reason: 'in_progress',
    message: `${last.passed}/${last.total} passing${regressedFromBest ? ` (regressed from best ${best})` : ''} — continue.`,
    ...base,
  };
}
