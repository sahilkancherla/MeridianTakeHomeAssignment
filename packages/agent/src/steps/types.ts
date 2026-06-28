/**
 * The business-logic contract — the "place for business logic" in the skeleton.
 *
 * A **handler** is the per-card logic a process needs: how to extract the PO number,
 * how to decide if the COA is within spec, what to do when a document is missing. The
 * skeleton owns *control flow* (the state machine); handlers own *what each step does*.
 * Codegen writes one handler per card; the self-healing loop edits them.
 *
 * A handler is intentionally small: read facts + call tools, then return a `StepOutcome`
 * (and optionally produce facts). It never touches edges, ids, or the trace — routing is
 * the runtime's job, so generated code stays focused and hard to get structurally wrong.
 */

import type { Card, FrozenSpec } from '@meridian/spec';
import type { StepOutcome } from '../runtime/outcome.js';
import type { ToolSet } from '../tools/types.js';

/** Everything a handler is given for one step. */
export type StepContext<C extends Card = Card> = {
  /** The card being executed, narrowed to its primitive type. */
  card: C;
  /** Read-only view of the blackboard (facts produced by earlier steps). */
  facts: Readonly<Record<string, unknown>>;
  /** Record a fact this step establishes (the card's "produces"). */
  write(name: string, value: unknown): void;
  /** Append a human-readable line to this step's trace (what it did / decided). */
  log(line: string): void;
  /** The full toolbox (Composio + LLM). Use whatever this card needs. */
  tools: ToolSet;
  /** The frozen spec, for context (a handler may read another card's fields/context). */
  spec: FrozenSpec;
  /** 1-based attempt count for this card (drives retry/give-up logic in loops). */
  attempt: number;
};

/** A handler returns where to go next. Returning a bare value is allowed for the common
 *  cases; returning a Promise is allowed because most real steps call tools. */
export type StepHandler<C extends Card = Card> = (
  ctx: StepContext<C>,
) => StepOutcome | Promise<StepOutcome>;

/** A generated agent's logic: one handler per card id. Cards with no entry fall back to
 *  the per-primitive default (steps/defaults.ts). */
export type HandlerMap = Record<string, StepHandler>;

/**
 * A complete, runnable agent = an immutable spec + the handlers generated from it.
 * This is the unit a Temporal worker hosts and the unit the eval suite runs. The
 * skeleton defines the shape; codegen fills `handlers`.
 */
export type AgentBundle = {
  spec: FrozenSpec;
  handlers: HandlerMap;
};
