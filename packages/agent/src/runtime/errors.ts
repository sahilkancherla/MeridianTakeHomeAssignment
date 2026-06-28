/**
 * Error taxonomy for the agent runtime.
 *
 * The distinction that matters for the self-healing loop: an *unimplemented* step is
 * a clear, actionable signal ("codegen didn't write this card's logic yet") that fails
 * the run loudly, whereas an *operational* error (a tool call threw) is something the
 * process itself may be designed to recover from via an Exception path. The runtime
 * treats the two differently — see `runtime/orchestrate.ts` and `steps/execute.ts`.
 */

/** Base class so callers can `catch (e) { if (e instanceof AgentError) … }`. */
export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Thrown by the default handler for a business-logic primitive (Action / Rule /
 * Decision / Branch) that has no generated implementation. This is the primary
 * signal the self-healing loop acts on: "this step needs code."
 */
export class UnimplementedStepError extends AgentError {
  constructor(public readonly cardId: string, cardType: string, label: string) {
    super(`Step "${label}" (${cardType} ${cardId}) has no handler — codegen must implement it.`);
  }
}

/** The graph never reached a terminal Outcome within the step budget — almost always
 *  a routing bug (a missing edge, or a loop that never exits). */
export class MaxStepsExceededError extends AgentError {
  constructor(maxSteps: number) {
    super(`Run exceeded ${maxSteps} steps without reaching an Outcome — likely a routing loop.`);
  }
}

/** A single card was visited more times than the loop guard allows — an Exception
 *  loop-back that never makes progress (e.g. "keep chasing the COA" with no exit). */
export class LoopGuardError extends AgentError {
  constructor(cardId: string, label: string, maxVisits: number) {
    super(`Card "${label}" (${cardId}) was visited more than ${maxVisits} times — a loop is not converging.`);
  }
}
