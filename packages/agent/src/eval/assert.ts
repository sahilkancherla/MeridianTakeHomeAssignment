/**
 * Compares one `AgentRun` against an `EvalExpectation` and returns the list of
 * divergences (empty = pass). The messages are written for the self-healing loop: each
 * says what was expected vs. what happened, so the next edit targets the right step.
 */

import type { AgentRun } from '../runtime/orchestrate.js';
import type { EvalExpectation } from './types.js';

export function assertRun(run: AgentRun, expect: EvalExpectation): string[] {
  const out: string[] = [];

  if (expect.status && run.status !== expect.status) {
    out.push(`status: expected "${expect.status}", got "${run.status}"${run.error ? ` (error: ${run.error})` : ''}`);
  }
  if (expect.disposition !== undefined && run.disposition !== expect.disposition) {
    out.push(`disposition: expected "${expect.disposition}", got ${run.disposition === null ? 'none' : `"${run.disposition}"`}`);
  }
  if (expect.outcomeCardId !== undefined && run.outcomeCardId !== expect.outcomeCardId) {
    out.push(`outcome card: expected "${expect.outcomeCardId}", got ${run.outcomeCardId ?? 'none'}`);
  }

  if (expect.facts) {
    for (const [k, v] of Object.entries(expect.facts)) {
      if (!(k in run.facts)) out.push(`fact "${k}": expected ${stringify(v)}, but it was never produced`);
      else if (!deepEqual(run.facts[k], v))
        out.push(`fact "${k}": expected ${stringify(v)}, got ${stringify(run.facts[k])}`);
    }
  }
  if (expect.factsContain) {
    for (const k of expect.factsContain) if (!(k in run.facts)) out.push(`fact "${k}": expected to be produced, but it was never set`);
  }
  if (expect.traceIncludesCards) {
    const visited = new Set(run.trace.map((t) => t.cardId));
    for (const id of expect.traceIncludesCards) if (!visited.has(id)) out.push(`trace: expected to visit card "${id}", but it was never reached`);
  }

  return out;
}

function stringify(v: unknown): string {
  return typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
}

/** Order-insensitive structural equality, adequate for eval expectations. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}
