/**
 * A `StepOutcome` is what a step tells the runtime to do next. It is the *only* way a
 * handler steers control flow — the runtime never inspects a handler's internals, it
 * just reads the outcome and walks the graph (`runtime/orchestrate.ts`).
 *
 * Keeping this as a small, closed union is deliberate: it is the seam between the
 * (process-agnostic) state machine and the (per-card) business logic, and it maps
 * one-to-one onto the spec's edge kinds.
 */

export type StepOutcome =
  /** Follow the single unlabeled outgoing edge (flow, or an Exception loop-back). */
  | { kind: 'next' }
  /** Follow the outgoing edge whose `branchLabel` matches — a Decision/Branch choice. */
  | { kind: 'branch'; label: string }
  /** Route along this card's outgoing Exception edge (may point backward / loop). */
  | { kind: 'raise'; condition?: string }
  /** Jump directly to a specific card (escape hatch for Exception handlers). */
  | { kind: 'goto'; cardId: string }
  /** Terminate the run successfully at an Outcome with this disposition. */
  | { kind: 'finish'; disposition: string }
  /** Terminate the run as failed with a reason (unimplemented / unrecoverable). */
  | { kind: 'fail'; reason: string };

// Terse constructors so generated handler code reads like prose:
//   return valuesInSpec ? branch('Yes') : branch('No');
export const next = (): StepOutcome => ({ kind: 'next' });
export const branch = (label: string): StepOutcome => ({ kind: 'branch', label });
export const raise = (condition?: string): StepOutcome => ({ kind: 'raise', condition });
export const goto = (cardId: string): StepOutcome => ({ kind: 'goto', cardId });
export const finish = (disposition: string): StepOutcome => ({ kind: 'finish', disposition });
export const fail = (reason: string): StepOutcome => ({ kind: 'fail', reason });
