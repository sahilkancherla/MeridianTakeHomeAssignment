/**
 * CLI the skill runs after each eval round to get a deterministic STOP/CONTINUE verdict.
 *
 *   pnpm --filter @meridian/agent heal-status -- <agentDir> [--reset]
 *
 * It reads <agentDir>/eval-report.json (this round's result) + hashes
 * <agentDir>/src/handlers.ts (for cycle detection), records the round in
 * <agentDir>/.heal-state.json, and prints a verdict line the skill parses:
 *
 *   HEAL: CONTINUE  — edit the failing handlers and run evals again.
 *   HEAL: STOP <reason>  — stop; on a non-success reason, write the escalation report.
 *
 * Limits come from env: HEAL_MAX_ROUNDS (default 6), HEAL_PLATEAU (default 2).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LIMITS, evaluateHeal, type HealLimits, type HealState } from './heal.js';
import { resolveInput } from '../paths.js';
import type { EvalReport } from './types.js';

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const reset = args.includes('--reset');
  const agentDirArg = args.find((a) => !a.startsWith('--'));
  if (!agentDirArg) {
    console.error('usage: heal-status <agentDir> [--reset]');
    process.exit(1);
  }
  const agentDir = resolveInput(agentDirArg);

  const statePath = join(agentDir, '.heal-state.json');
  if (reset) {
    if (existsSync(statePath)) rmSync(statePath);
    console.log('HEAL: RESET — fresh self-heal loop.');
    return;
  }

  const reportPath = join(agentDir, 'eval-report.json');
  if (!existsSync(reportPath)) {
    console.error(`No eval-report.json in ${agentDir} — run the evals first.`);
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as EvalReport;

  const handlersPath = join(agentDir, 'src', 'handlers.ts');
  const handlersHash = existsSync(handlersPath)
    ? createHash('sha256').update(readFileSync(handlersPath)).digest('hex').slice(0, 16)
    : 'missing';

  const state: HealState = existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, 'utf8')) as HealState)
    : { rounds: [] };
  state.rounds.push({ round: state.rounds.length + 1, passed: report.passed, total: report.total, handlersHash });

  const limits: HealLimits = {
    maxRounds: Number(process.env.HEAL_MAX_ROUNDS ?? DEFAULT_LIMITS.maxRounds),
    plateauWindow: Number(process.env.HEAL_PLATEAU ?? DEFAULT_LIMITS.plateauWindow),
  };
  const verdict = evaluateHeal(state, limits);
  writeFileSync(statePath, JSON.stringify(state, null, 2));

  console.log(`\nRound ${verdict.round}: ${verdict.passed}/${verdict.total} passing (best ${verdict.best}).`);
  if (verdict.regressedFromBest) console.log('⚠ regressed below the best round — prefer restoring the best handlers.');
  console.log(verdict.message);
  console.log(verdict.decision === 'continue' ? '\nHEAL: CONTINUE' : `\nHEAL: STOP ${verdict.reason}`);
  if (verdict.decision === 'stop' && verdict.reason !== 'success') {
    console.log('→ Write HEAL_REPORT.md classifying the remaining failures (code bug / spec underspecified / eval error / missing capability) and escalate.');
  }
}

main();
