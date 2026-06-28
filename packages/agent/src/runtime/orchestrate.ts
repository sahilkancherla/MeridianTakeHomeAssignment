/**
 * The agent's entry point and state-machine driver.
 *
 * `orchestrate()` walks the spec's graph from the Trigger to an Outcome, holding the
 * data-flow **blackboard** (the spec's facts model becomes the agent's working memory)
 * and routing on each step's `StepOutcome`. It is **deterministic**: it performs no I/O
 * itself — every side effect goes through the injected `executeStep` port. That is what
 * lets the very same function body be a Temporal *workflow* (where `executeStep` is a
 * proxied activity) and also run in-process for a fast smoke test (where `executeStep`
 * is a direct call). The skeleton's control flow can never drift from what Temporal runs.
 *
 * Required pieces of an agent skeleton, located:
 *   • entry point      → this function (resolves the Trigger, drives the loop)
 *   • step execution   → the loop + `executeStep` port
 *   • error handling   → fail/raise routing + the step & loop guards below
 *   • business logic    → injected via `executeStep` (steps/execute.ts → generated handlers)
 *   • tool calls        → reached from inside `executeStep` (tools/*)
 */

import type { FrozenSpec, PrimitiveType } from '@meridian/spec';
import type { StepOutcome } from './outcome.js';
import { branchTarget, entryOf, exceptionTarget, indexGraph, nextTarget } from './graph.js';
import { LoopGuardError, MaxStepsExceededError } from './errors.js';

/** What the deterministic loop hands to the side-effecting world for one card. */
export type ExecuteStepInput = {
  cardId: string;
  /** A read-only snapshot of the blackboard at this step. */
  facts: Readonly<Record<string, unknown>>;
  /** 1-based count of how many times this card has been entered (for retry logic). */
  attempt: number;
};

/** What comes back: the routing decision plus any facts the step established. */
export type ExecuteStepResult = {
  outcome: StepOutcome;
  /** Fact writes to merge into the blackboard (the step's "produces"). */
  facts?: Record<string, unknown>;
  /** Lines to append to the trace entry (tool calls made, decisions explained). */
  logs?: string[];
  /** Set if the handler threw an operational error (already mapped to an outcome). */
  error?: string;
};

/** The seam: given a card + current facts, do the work and say where to go next.
 *  In production this is a Temporal activity; in tests, a direct in-process call. */
export type ExecuteStep = (input: ExecuteStepInput) => Promise<ExecuteStepResult>;

export type RunConfig = {
  /** Hard cap on total steps before bailing out (default 500). */
  maxSteps?: number;
  /** Max times any single card may be entered before the loop guard trips (default 50). */
  maxVisitsPerCard?: number;
};

export type AgentInput = {
  /** Seed facts available to the Trigger (e.g. the inbound email). */
  facts?: Record<string, unknown>;
};

export type TraceEntry = {
  /** Monotonic step index — deterministic (not a wall clock), so it is Temporal-safe. */
  step: number;
  cardId: string;
  cardType: PrimitiveType | null;
  attempt: number;
  outcome: StepOutcome;
  /** Fact names this step established. */
  produced: string[];
  /** The card the runtime routed to next (null when the run ended here). */
  next: string | null;
  logs: string[];
  warning?: string;
  error?: string;
};

export type RunStatus = 'completed' | 'failed';

export type AgentRun = {
  status: RunStatus;
  /** The Outcome disposition reached (e.g. "approved" / "held"), or null on failure. */
  disposition: string | null;
  outcomeCardId: string | null;
  /** Final blackboard — every fact the run established. The eval suite asserts on this. */
  facts: Record<string, unknown>;
  /** Full execution trace — the other thing evals assert on, and what self-heal reads. */
  trace: TraceEntry[];
  /** Present on failure: why the run stopped. */
  error?: string;
};

export async function orchestrate(
  spec: FrozenSpec,
  input: AgentInput,
  executeStep: ExecuteStep,
  config: RunConfig = {},
): Promise<AgentRun> {
  const maxSteps = config.maxSteps ?? 500;
  const maxVisits = config.maxVisitsPerCard ?? 50;

  const idx = indexGraph(spec);
  const facts: Record<string, unknown> = { ...(input.facts ?? {}) };
  const trace: TraceEntry[] = [];
  const visits = new Map<string, number>();

  let current = entryOf(spec, idx);
  if (!current) {
    return fail(facts, trace, 'No entry point — the spec has no single Trigger to start from.');
  }

  let step = 0;
  while (current) {
    if (++step > maxSteps) throw new MaxStepsExceededError(maxSteps);

    const card = idx.byId.get(current)!;
    const attempt = (visits.get(current) ?? 0) + 1;
    visits.set(current, attempt);
    if (attempt > maxVisits) throw new LoopGuardError(current, card.label, maxVisits);

    const res = await executeStep({ cardId: current, facts, attempt });

    // Merge the step's produced facts before routing (a Decision can read what the
    // Action just before it established).
    if (res.facts) Object.assign(facts, res.facts);

    const entry: TraceEntry = {
      step,
      cardId: current,
      cardType: card.type,
      attempt,
      outcome: res.outcome,
      produced: res.facts ? Object.keys(res.facts) : [],
      next: null,
      logs: res.logs ?? [],
      ...(res.error ? { error: res.error } : {}),
    };

    // Resolve the next card from the step's routing decision.
    const o = res.outcome;
    let nextId: string | null = null;
    switch (o.kind) {
      case 'finish':
        entry.next = null;
        trace.push(entry);
        return { status: 'completed', disposition: o.disposition, outcomeCardId: current, facts, trace };
      case 'fail':
        entry.next = null;
        trace.push(entry);
        return { status: 'failed', disposition: null, outcomeCardId: null, facts, trace, error: o.reason };
      case 'next': {
        const t = nextTarget(idx, current);
        if (t.warning) entry.warning = t.warning;
        nextId = t.target;
        if (!nextId) return endHere(entry, trace, facts, `Card "${card.label}" has no outgoing path — dead end.`);
        break;
      }
      case 'branch': {
        nextId = branchTarget(idx, current, o.label);
        if (!nextId)
          return endHere(entry, trace, facts, `Branch "${o.label}" from "${card.label}" has no target edge.`);
        break;
      }
      case 'raise': {
        nextId = exceptionTarget(idx, current);
        if (!nextId)
          return endHere(
            entry,
            trace,
            facts,
            `"${card.label}" raised${o.condition ? ` (${o.condition})` : ''} but has no Exception edge to handle it.`,
          );
        break;
      }
      case 'goto':
        nextId = idx.byId.has(o.cardId) ? o.cardId : null;
        if (!nextId) return endHere(entry, trace, facts, `goto target "${o.cardId}" does not exist.`);
        break;
    }

    entry.next = nextId;
    trace.push(entry);
    current = nextId;
  }

  return fail(facts, trace, 'Walk ended without reaching an Outcome.');
}

// --- helpers ---------------------------------------------------------------

function endHere(
  entry: TraceEntry,
  trace: TraceEntry[],
  facts: Record<string, unknown>,
  error: string,
): AgentRun {
  entry.error = (entry.error ? entry.error + '; ' : '') + error;
  trace.push(entry);
  return { status: 'failed', disposition: null, outcomeCardId: null, facts, trace, error };
}

function fail(facts: Record<string, unknown>, trace: TraceEntry[], error: string): AgentRun {
  return { status: 'failed', disposition: null, outcomeCardId: null, facts, trace, error };
}
