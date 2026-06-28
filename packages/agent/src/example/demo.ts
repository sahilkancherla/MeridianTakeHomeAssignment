/**
 * Zero-infra smoke test: runs the example agent through the runtime in-process, using the
 * *same* `createExecuteStep` the Temporal activity uses — so it proves the skeleton works
 * without standing up a Temporal cluster, and there is no risk of the in-process path
 * drifting from what the worker runs.
 *
 *   pnpm --filter @meridian/agent demo
 *
 * To run the identical bundle through real Temporal instead: start `temporal server
 * start-dev`, run `pnpm --filter @meridian/agent worker`, then call `runAgentWorkflow`
 * from temporal/client.ts.
 */

import { orchestrate, type AgentRun } from '../runtime/orchestrate.js';
import { createExecuteStep } from '../steps/execute.js';
import { createFakeToolSet } from '../tools/fake.js';
import { exampleBundle } from './approval/bundle.js';

function printRun(label: string, run: AgentRun): void {
  console.log(`\n=== ${label} ===`);
  console.log(`status=${run.status}  disposition=${run.disposition ?? '—'}  ${run.error ? `error="${run.error}"` : ''}`);
  console.log('facts:', run.facts);
  console.log('trace:');
  for (const t of run.trace) {
    const bits = [`#${t.step}`, t.cardType, t.cardId, `→ ${t.outcome.kind}`];
    if (t.next) bits.push(`next=${t.next}`);
    if (t.produced.length) bits.push(`+{${t.produced.join(',')}}`);
    console.log('  ', bits.join('  '), t.logs.length ? `:: ${t.logs.join(' | ')}` : '');
  }
}

async function main() {
  const tools = createFakeToolSet();
  const executeStep = createExecuteStep(exampleBundle, tools);

  const lowRisk = await orchestrate(exampleBundle.spec, { facts: { amount: 250 } }, executeStep);
  printRun('low-risk request (amount=250)', lowRisk);

  const highRisk = await orchestrate(exampleBundle.spec, { facts: { amount: 99_000 } }, executeStep);
  printRun('high-risk request (amount=99,000)', highRisk);

  const ok =
    lowRisk.status === 'completed' &&
    lowRisk.disposition === 'approved' &&
    highRisk.status === 'completed' &&
    highRisk.disposition === 'manual_review';
  console.log(`\n${ok ? '✓ skeleton smoke test passed' : '✗ unexpected result'}`);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
