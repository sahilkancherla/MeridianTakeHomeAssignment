/** Loads + validates an external `evals.json` into typed `EvalCase`s. Clear errors on a
 *  malformed file, since a broken eval file should fail loudly, not silently pass. */

import { readFileSync } from 'node:fs';
import type { EvalCase } from './types.js';

export function loadCases(path: string): EvalCase[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read eval file "${path}": ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(raw)) throw new Error(`Eval file "${path}" must be a JSON array of cases.`);

  return raw.map((c, i) => {
    const obj = c as Partial<EvalCase>;
    if (typeof obj.name !== 'string') throw new Error(`Eval case #${i + 1} is missing a string "name".`);
    if (typeof obj.expect !== 'object' || obj.expect === null) throw new Error(`Eval case "${obj.name}" is missing "expect".`);
    return { name: obj.name, input: obj.input ?? { facts: {} }, expect: obj.expect };
  });
}
