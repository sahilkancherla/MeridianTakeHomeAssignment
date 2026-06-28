/**
 * The real Composio adapter — general access to every Composio toolkit through one
 * `execute(slug, args)` method (see tools/types.ts for why this is general, not
 * Gmail-specific). Runs only inside a Temporal **activity**; never the workflow.
 *
 * Outbound posture (the take-home's choice — read real, simulate sends): a call marked
 * `sideEffect: 'write'` is intercepted and logged unless `outboundMode === 'live'`, so
 * the agent can really read the inbox while its replies to exporters are dry-run.
 */

import { Composio } from '@composio/core';
import type {
  ComposioExecuteOptions,
  ComposioTools,
  Logger,
  OutboundMode,
  ToolResult,
} from './types.js';

export type ComposioToolsOptions = {
  apiKey: string;
  /** Composio connected-account user id (e.g. the receiving inbox owner). */
  userId: string;
  outboundMode: OutboundMode;
  logger: Logger;
};

export function createComposioTools(opts: ComposioToolsOptions): ComposioTools {
  const client = new Composio({ apiKey: opts.apiKey });

  return {
    async execute(
      toolSlug: string,
      args: Record<string, unknown>,
      o: ComposioExecuteOptions = {},
    ): Promise<ToolResult> {
      const sideEffect = o.sideEffect ?? 'read';
      const userId = o.userId ?? opts.userId;

      // Gate outbound writes behind the outbound mode — the central "simulate sends" rule.
      if (sideEffect === 'write' && opts.outboundMode !== 'live') {
        opts.logger.info(`(simulated outbound) ${toolSlug}`, args);
        return { ok: true, data: { simulated: true, toolSlug, args }, simulated: true };
      }

      try {
        const res = await client.tools.execute(toolSlug, { userId, arguments: args });
        // Composio returns { successful/successfull, data, error } shapes across versions;
        // normalize to our ToolResult without over-fitting one version.
        const r = res as { successful?: boolean; successfull?: boolean; data?: unknown; error?: unknown };
        const ok = r.successful ?? r.successfull ?? true;
        opts.logger.debug(`composio ${toolSlug} ${ok ? 'ok' : 'failed'}`);
        return ok
          ? { ok: true, data: r.data ?? res }
          : { ok: false, data: r.data ?? null, error: String(r.error ?? 'composio tool failed') };
      } catch (err) {
        opts.logger.error(`composio ${toolSlug} threw`, { err: String(err) });
        return { ok: false, data: null, error: String(err) };
      }
    },
  };
}
