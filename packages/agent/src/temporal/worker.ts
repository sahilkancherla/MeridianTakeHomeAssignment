/**
 * The Temporal **worker** — long-lived process that hosts one agent bundle: it polls a
 * task queue, runs `agentWorkflow`, and executes the `executeStep` activity bound to the
 * bundle's handlers + the live toolset.
 *
 * One worker hosts one bundle on one task queue. To host several agents, run several
 * workers (different task queues). For the take-home that's a single receiving agent.
 *
 * Run it: start a Temporal dev server (`temporal server start-dev`), then `pnpm worker`.
 * With no Composio/Anthropic keys it boots against the offline fake toolset.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createActivities } from './activities.js';
import { toolSetFromEnv } from '../tools/index.js';
import type { AgentBundle } from '../steps/types.js';

export type WorkerOptions = {
  taskQueue?: string;
  address?: string;
  namespace?: string;
};

export async function startWorker(bundle: AgentBundle, opts: WorkerOptions = {}): Promise<void> {
  const address = opts.address ?? process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const namespace = opts.namespace ?? process.env.TEMPORAL_NAMESPACE ?? 'default';
  const taskQueue = opts.taskQueue ?? process.env.TEMPORAL_TASK_QUEUE ?? 'agent';

  const connection = await NativeConnection.connect({ address });
  const tools = toolSetFromEnv();
  const here = dirname(fileURLToPath(import.meta.url));

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: join(here, 'workflow.ts'),
    activities: createActivities(bundle, tools),
  });

  console.log(`[agent-worker] hosting "${bundle.spec.processName}" on ${address}/${namespace} queue="${taskQueue}"`);
  await worker.run();
}

// `pnpm worker` hosts the bundled example so the Temporal path is runnable out of the box.
// A real deployment imports a generated bundle and calls startWorker(thatBundle).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { exampleBundle } = await import('../example/approval/bundle.js');
  await startWorker(exampleBundle).catch((err) => {
    console.error('[agent-worker] failed to start:', err);
    process.exit(1);
  });
}
