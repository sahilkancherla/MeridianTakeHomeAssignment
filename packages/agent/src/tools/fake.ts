/**
 * An offline, deterministic toolset. No API keys, no network. It lets the runtime,
 * the example, and unit tests exercise the full state machine without Composio or
 * Anthropic — and gives the eval loop a hermetic default when live tools aren't wired.
 *
 * Reads return whatever canned data you register; writes are always "simulated".
 */

import type {
  ComposioExecuteOptions,
  ComposioTools,
  Logger,
  LlmTool,
  ToolResult,
  ToolSet,
} from './types.js';
import { createSecretsTool } from './secrets.js';

export const consoleLogger: Logger = {
  info: (m, meta) => console.log(`[agent] ${m}`, meta ?? ''),
  warn: (m, meta) => console.warn(`[agent] ${m}`, meta ?? ''),
  error: (m, meta) => console.error(`[agent] ${m}`, meta ?? ''),
  debug: (m, meta) => (process.env.AGENT_DEBUG ? console.debug(`[agent] ${m}`, meta ?? '') : void 0),
};

export type FakeToolOptions = {
  logger?: Logger;
  /** Canned responses for `composio.execute`, keyed by tool slug. */
  composioResponses?: Record<string, unknown>;
  /** Canned responses for `llm.complete` / `llm.extract`, keyed loosely by a substring
   *  of the prompt/instructions. First match wins; falls back to an empty value. */
  llmResponses?: Array<{ match: string; reply: unknown }>;
  /** Canned secret values, keyed by a System's declared secret `key`. */
  secrets?: Record<string, string>;
};

export function createFakeToolSet(opts: FakeToolOptions = {}): ToolSet {
  const logger = opts.logger ?? consoleLogger;

  const composio: ComposioTools = {
    async execute(toolSlug: string, args: Record<string, unknown>, o: ComposioExecuteOptions = {}): Promise<ToolResult> {
      const sideEffect = o.sideEffect ?? 'read';
      if (sideEffect === 'write') {
        logger.info(`(simulated) ${toolSlug}`, args);
        return { ok: true, data: { simulated: true, toolSlug, args }, simulated: true };
      }
      const data = opts.composioResponses?.[toolSlug] ?? null;
      logger.debug(`fake composio read ${toolSlug}`, { args, hit: data != null });
      return { ok: true, data };
    },
  };

  const pick = (needle: string): unknown =>
    opts.llmResponses?.find((r) => needle.toLowerCase().includes(r.match.toLowerCase()))?.reply ?? null;

  const llm: LlmTool = {
    async complete({ prompt }) {
      const r = pick(prompt);
      return typeof r === 'string' ? r : r != null ? JSON.stringify(r) : '';
    },
    async extract<T>({ instructions, input }: { instructions: string; input: string }): Promise<T> {
      return (pick(instructions) ?? pick(input) ?? {}) as T;
    },
  };

  const secrets = createSecretsTool({ values: opts.secrets ?? {}, logger });

  return { composio, llm, secrets, logger, outboundMode: 'simulate' };
}
