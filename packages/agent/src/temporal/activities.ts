/**
 * The Temporal **activities** — the only place side effects happen.
 *
 * There is exactly one activity, `executeStep`: given a card id + the current facts, it
 * runs that card's handler (generated logic, or the per-primitive default) with the live
 * toolbox and returns a routing decision. Keeping it to one generic activity means the
 * worker's activity registration is fixed while the *handlers* (the generated code) can
 * change freely between self-heal iterations — restart the worker and it runs the new code.
 *
 * The bare `executeStep` export below is a **type anchor** for `proxyActivities<typeof
 * activities>` in the workflow. The worker registers the real, bundle-bound implementation
 * from `createActivities()`; calling the bare export at runtime is a wiring bug.
 */

import type { ExecuteStepInput, ExecuteStepResult } from '../runtime/orchestrate.js';
import { createExecuteStep } from '../steps/execute.js';
import type { AgentBundle } from '../steps/types.js';
import type { ToolSet } from '../tools/types.js';

export async function executeStep(_input: ExecuteStepInput): Promise<ExecuteStepResult> {
  throw new Error(
    'executeStep is not bound — register createActivities(bundle, tools) on the Worker (see temporal/worker.ts).',
  );
}

/** Build the activity implementations bound to a specific agent bundle + toolset.
 *  The worker passes the result as its `activities`. */
export function createActivities(
  bundle: AgentBundle,
  tools: ToolSet,
): { executeStep: (input: ExecuteStepInput) => Promise<ExecuteStepResult> } {
  return { executeStep: createExecuteStep(bundle, tools) };
}
