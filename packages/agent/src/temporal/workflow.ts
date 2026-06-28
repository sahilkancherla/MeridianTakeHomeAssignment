/**
 * The Temporal **workflow** — the durable host for an agent run.
 *
 * It is intentionally tiny: it proxies the one `executeStep` activity and hands it to
 * `orchestrate()`. All the control-flow logic lives in `orchestrate` (deterministic, no
 * I/O), all the side effects live in the activity. That separation is exactly Temporal's
 * determinism contract — and it is also the §0 thesis in code: the spec is a state
 * machine (this workflow) executed on a durable runtime (Temporal), with the real work
 * pushed to activities.
 *
 * Determinism note: this module and everything it imports (orchestrate/graph/outcome/
 * errors) are pure — no Date.now, no randomness, no network. The trace uses a step
 * counter, not a clock. Safe to replay.
 */

import { proxyActivities } from '@temporalio/workflow';
import type { FrozenSpec } from '@meridian/spec';
import {
  orchestrate,
  type AgentInput,
  type AgentRun,
  type ExecuteStepInput,
  type RunConfig,
} from '../runtime/orchestrate.js';
import type * as activities from './activities.js';

const { executeStep } = proxyActivities<typeof activities>({
  // A single step (a Gmail read, an LLM extraction) gets up to 2 minutes; a step that
  // throws at the infra level is retried a couple of times. Business failures don't
  // throw — they come back as outcomes — so they are not retried here (see steps/execute.ts).
  startToCloseTimeout: '2 minutes',
  retry: { maximumAttempts: 2 },
});

export type AgentWorkflowArgs = {
  spec: FrozenSpec;
  input: AgentInput;
  config?: RunConfig;
};

export async function agentWorkflow(args: AgentWorkflowArgs): Promise<AgentRun> {
  return orchestrate(
    args.spec,
    args.input,
    (i: ExecuteStepInput) => executeStep(i),
    args.config ?? {},
  );
}
