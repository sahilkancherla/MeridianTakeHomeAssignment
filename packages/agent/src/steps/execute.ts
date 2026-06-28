/**
 * `createExecuteStep` builds the side-effecting `ExecuteStep` port the runtime calls
 * once per card. It is the bridge between the deterministic state machine and the
 * messy outside world: it resolves the card's handler (generated, or the per-primitive
 * default), gives it a fact-writer + logger + the toolbox, runs it, and turns the
 * result — including thrown errors — into a routing decision the runtime understands.
 *
 * Crucially this function has **no Temporal dependency**. The Temporal activity wraps it
 * (temporal/activities.ts) and the in-process demo calls it directly — the exact same
 * step execution either way, so what self-heal validates is what production runs.
 *
 * Error policy (mirrors steps/defaults.ts):
 *   • UnimplementedStepError → `fail` outcome (a located "write this step" signal).
 *   • any other throw        → `raise`, so the process's own Exception path can handle a
 *     real operational failure (a tool 500, a malformed doc); if no Exception edge exists
 *     the runtime fails the run with the original error attached.
 */

import type { ExecuteStep, ExecuteStepResult } from '../runtime/orchestrate.js';
import { raise, type StepOutcome } from '../runtime/outcome.js';
import { UnimplementedStepError } from '../runtime/errors.js';
import type { ToolSet } from '../tools/types.js';
import { defaultHandler } from './defaults.js';
import type { AgentBundle, StepContext } from './types.js';

export function createExecuteStep(bundle: AgentBundle, tools: ToolSet): ExecuteStep {
  const byId = new Map(bundle.spec.cards.map((c) => [c.id, c]));

  return async function executeStep({ cardId, facts, attempt }): Promise<ExecuteStepResult> {
    const card = byId.get(cardId);
    if (!card) return { outcome: { kind: 'fail', reason: `Unknown card ${cardId}` } };

    const writes: Record<string, unknown> = {};
    const logs: string[] = [];
    const ctx: StepContext = {
      card,
      facts,
      write: (name, value) => {
        writes[name] = value;
      },
      log: (line) => logs.push(line),
      tools,
      spec: bundle.spec,
      attempt,
    };

    const handler = bundle.handlers[cardId] ?? defaultHandler(card);

    try {
      const outcome: StepOutcome = await handler(ctx);
      return { outcome, facts: writes, logs };
    } catch (err) {
      if (err instanceof UnimplementedStepError) {
        return { outcome: { kind: 'fail', reason: err.message }, facts: writes, logs };
      }
      // Operational failure: hand control to the process's Exception path (if any).
      const message = err instanceof Error ? err.message : String(err);
      logs.push(`error: ${message}`);
      return { outcome: raise('step error'), facts: writes, logs, error: message };
    }
  };
}
