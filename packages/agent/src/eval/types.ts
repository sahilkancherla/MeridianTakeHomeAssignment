/**
 * The eval contract. An eval **case** is one input the agent must handle and the output
 * it's expected to produce; the suite is the external `evals.json` an engineer supplies
 * next to a generated bundle (the chosen design — eval data lives outside the spec).
 *
 * Expectations are intentionally a small, declarative set of checks over the structured
 * `AgentRun` (disposition / facts / trace), not free-form assertions — so the self-heal
 * loop can read exactly *what* diverged and fix the right handler.
 */

export type EvalExpectation = {
  /** The run's terminal status. */
  status?: 'completed' | 'failed';
  /** The Outcome disposition reached (e.g. "approved" / "held"). The most common check. */
  disposition?: string;
  /** The specific Outcome card id reached. */
  outcomeCardId?: string;
  /** Each listed fact must be present and deep-equal to the given value. */
  facts?: Record<string, unknown>;
  /** These fact names must exist on the final blackboard (value unchecked). */
  factsContain?: string[];
  /** These card ids must each appear somewhere in the execution trace. */
  traceIncludesCards?: string[];
};

export type EvalCase = {
  name: string;
  /** Seed facts handed to the Trigger (e.g. an inbound email payload). */
  input: { facts?: Record<string, unknown> };
  expect: EvalExpectation;
};

export type CaseResult = {
  name: string;
  passed: boolean;
  /** Human-readable divergences — what the self-heal loop reads to decide its next edit. */
  mismatches: string[];
  status: string;
  disposition: string | null;
  error?: string;
};

export type EvalReport = {
  total: number;
  passed: number;
  failed: number;
  results: CaseResult[];
};
