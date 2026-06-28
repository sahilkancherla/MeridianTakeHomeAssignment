/**
 * `runEvalFile` — the convenience entry a generated agent's `src/eval.ts` calls: load the
 * external eval cases, run them through Temporal, print a readable report, and persist a
 * machine-readable `eval-report.json` next to the eval file so the heal-controller (and
 * the skill) can read the round's result. Returns the report.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadCases } from './loadCases.js';
import { runEvals, type RunEvalsOptions } from './harness.js';
import type { AgentBundle } from '../steps/types.js';
import type { EvalReport } from './types.js';

export async function runEvalFile(bundle: AgentBundle, evalsPath: string, opts: RunEvalsOptions = {}): Promise<EvalReport> {
  const cases = loadCases(evalsPath);
  console.log(`\n[eval] "${bundle.spec.processName}" — ${cases.length} case(s) via ephemeral Temporal…\n`);
  const report = await runEvals(bundle, cases, opts);

  for (const r of report.results) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}  [${r.status}${r.disposition ? ` · ${r.disposition}` : ''}]`);
    for (const m of r.mismatches) console.log(`      - ${m}`);
  }
  console.log(`\n[eval] ${report.passed}/${report.total} passing.\n`);

  const reportPath = join(dirname(evalsPath), 'eval-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[eval] report → ${reportPath}`);
  return report;
}
