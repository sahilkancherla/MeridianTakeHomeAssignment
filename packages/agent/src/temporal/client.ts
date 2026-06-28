/**
 * The Temporal **client** — starts an `agentWorkflow` run and awaits its result.
 *
 * This is the entry the self-healing eval loop calls once per test case: feed a spec +
 * an input (a sample email), run it through the *real* Temporal workflow on the worker,
 * and get back the structured `AgentRun` to assert against. Because every iteration goes
 * through Temporal, the loop validates exactly what production executes.
 */

import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import type { FrozenSpec } from '@meridian/spec';
import { agentWorkflow } from './workflow.js';
import type { AgentInput, AgentRun, RunConfig } from '../runtime/orchestrate.js';

export type RunWorkflowOptions = {
  taskQueue?: string;
  address?: string;
  namespace?: string;
  /** Defaults to a unique id per run; pass a stable id to dedupe eval reruns. */
  workflowId?: string;
  config?: RunConfig;
};

export async function runAgentWorkflow(
  spec: FrozenSpec,
  input: AgentInput,
  opts: RunWorkflowOptions = {},
): Promise<AgentRun> {
  const address = opts.address ?? process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const namespace = opts.namespace ?? process.env.TEMPORAL_NAMESPACE ?? 'default';
  const taskQueue = opts.taskQueue ?? process.env.TEMPORAL_TASK_QUEUE ?? 'agent';

  const connection = await Connection.connect({ address });
  try {
    const client = new Client({ connection, namespace });
    const handle = await client.workflow.start(agentWorkflow, {
      taskQueue,
      workflowId: opts.workflowId ?? `agent-${spec.specId}-${randomUUID()}`,
      args: [{ spec, input, ...(opts.config ? { config: opts.config } : {}) }],
    });
    return await handle.result();
  } finally {
    await connection.close();
  }
}
