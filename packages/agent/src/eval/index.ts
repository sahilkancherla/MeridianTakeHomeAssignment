/** Public eval surface — imported by generated agents as `@meridian/agent/eval`. */

export * from './types.js';
export { assertRun } from './assert.js';
export { loadCases } from './loadCases.js';
export { runEvals, type RunEvalsOptions } from './harness.js';
export { runEvalFile } from './run.js';
export {
  evaluateHeal,
  DEFAULT_LIMITS,
  type HealState,
  type HealLimits,
  type HealVerdict,
  type RoundRecord,
  type HealStopReason,
} from './heal.js';
