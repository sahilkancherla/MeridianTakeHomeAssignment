/**
 * The eval harness — runs a bundle through a **real** (ephemeral) Temporal server, one
 * workflow per case, and asserts each result. Every iteration of the self-heal loop goes
 * through this, so the loop validates exactly what production runs.
 *
 * It spins a `TestWorkflowEnvironment` (a real Temporal dev server, started per call and
 * torn down after), registers a Worker for the bundle's workflow + activities, executes
 * each case, and collects a structured `EvalReport`.
 *
 * Guardrails live here too: a **per-case timeout** so one wedged workflow can't stall a
 * round, on top of the runtime's own `maxSteps` / `maxVisitsPerCard` guards.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { NativeConnection, Worker } from '@temporalio/worker';
import { Client, Connection } from '@temporalio/client';
import { agentWorkflow } from '../temporal/workflow.js';
import { createActivities } from '../temporal/activities.js';
import { toolSetFromEnv } from '../tools/index.js';
import type { ToolSet } from '../tools/types.js';
import type { AgentBundle } from '../steps/types.js';
import type { RunConfig } from '../runtime/orchestrate.js';
import { assertRun } from './assert.js';
import type { CaseResult, EvalCase, EvalReport } from './types.js';

const workflowPath = (): string => join(dirname(fileURLToPath(import.meta.url)), '..', 'temporal', 'workflow.ts');

export type RunEvalsOptions = {
  /** Toolset for the activities; defaults to env (fake if no keys). For hermetic, repeatable
   *  evals prefer a fixed fake toolset so failures are real, not flaky. */
  tools?: ToolSet;
  /** Runtime guards (maxSteps / maxVisitsPerCard) passed into each run. */
  config?: RunConfig;
  /** Per-case wall-clock cap in ms (default 60_000). A case that exceeds it fails. */
  caseTimeoutMs?: number;
  taskQueue?: string;
  /**
   * Where Temporal comes from. Default: spin an ephemeral local server (zero setup).
   * Set an external address (or the EVAL_TEMPORAL_ADDRESS env) to run against an
   * already-running `temporal server start-dev` — useful where the ephemeral binary
   * download is blocked, or to share one server across runs.
   */
  server?: 'ephemeral' | { address: string; namespace?: string };
};

type EvalServer = {
  nativeConnection: NativeConnection;
  client: Client;
  namespace: string;
  teardown: () => Promise<void>;
};

async function connectServer(server: RunEvalsOptions['server']): Promise<EvalServer> {
  let external: { address: string; namespace?: string } | null = null;
  if (server && server !== 'ephemeral') {
    external = server;
  } else if (process.env.EVAL_TEMPORAL_ADDRESS) {
    external = {
      address: process.env.EVAL_TEMPORAL_ADDRESS,
      ...(process.env.TEMPORAL_NAMESPACE ? { namespace: process.env.TEMPORAL_NAMESPACE } : {}),
    };
  }

  if (external) {
    const namespace = external.namespace ?? 'default';
    const nativeConnection = await NativeConnection.connect({ address: external.address });
    const connection = await Connection.connect({ address: external.address });
    const client = new Client({ connection, namespace });
    return {
      nativeConnection,
      client,
      namespace,
      teardown: async () => {
        await nativeConnection.close();
        await connection.close();
      },
    };
  }

  const env = await TestWorkflowEnvironment.createLocal();
  return {
    nativeConnection: env.nativeConnection,
    client: env.client,
    namespace: env.namespace ?? 'default',
    teardown: () => env.teardown(),
  };
}

export async function runEvals(bundle: AgentBundle, cases: EvalCase[], opts: RunEvalsOptions = {}): Promise<EvalReport> {
  const tools = opts.tools ?? toolSetFromEnv();
  const taskQueue = opts.taskQueue ?? 'eval';
  const caseTimeoutMs = opts.caseTimeoutMs ?? 60_000;

  const env = await connectServer(opts.server);
  try {
    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue,
      workflowsPath: workflowPath(),
      activities: createActivities(bundle, tools),
    });

    const results = await worker.runUntil(async (): Promise<CaseResult[]> => {
      const out: CaseResult[] = [];
      let i = 0;
      for (const c of cases) {
        i += 1;
        out.push(await runOne(env, taskQueue, bundle, c, i, caseTimeoutMs, opts.config));
      }
      return out;
    });

    const passed = results.filter((r) => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  } finally {
    await env.teardown();
  }
}

async function runOne(
  env: EvalServer,
  taskQueue: string,
  bundle: AgentBundle,
  c: EvalCase,
  i: number,
  timeoutMs: number,
  config?: RunConfig,
): Promise<CaseResult> {
  try {
    const handle = await env.client.workflow.start(agentWorkflow, {
      taskQueue,
      workflowId: `eval-${bundle.spec.specId}-${i}`,
      args: [{ spec: bundle.spec, input: c.input, ...(config ? { config } : {}) }],
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`case timed out after ${timeoutMs}ms`)), timeoutMs).unref(),
    );
    const run = await Promise.race([handle.result(), timeout]);

    const mismatches = assertRun(run, c.expect);
    return {
      name: c.name,
      passed: mismatches.length === 0,
      mismatches,
      status: run.status,
      disposition: run.disposition,
      ...(run.error ? { error: run.error } : {}),
    };
  } catch (err) {
    return {
      name: c.name,
      passed: false,
      mismatches: [`run error: ${err instanceof Error ? err.message : String(err)}`],
      status: 'failed',
      disposition: null,
    };
  }
}
