/**
 * Toolset factory. Picks the live adapters when keys are present, otherwise falls back
 * to the offline fake — so a fresh clone runs the whole state machine with zero config,
 * and wiring real Composio/Anthropic is just providing env vars.
 *
 * `createToolSet` is called from inside the Temporal activity (where I/O is allowed),
 * once per worker, and reused across step executions.
 */

import { createComposioTools } from './composio.js';
import { createLlmTool } from './anthropic.js';
import { consoleLogger, createFakeToolSet } from './fake.js';
import { createSecretsTool } from './secrets.js';
import type { Logger, OutboundMode, ToolSet } from './types.js';

export * from './types.js';
export { createFakeToolSet, consoleLogger } from './fake.js';
export { createComposioTools } from './composio.js';
export { createLlmTool } from './anthropic.js';
export { createSecretsTool, secretEnvVar } from './secrets.js';

export type ToolSetEnv = {
  composioApiKey?: string;
  composioUserId?: string;
  anthropicApiKey?: string;
  llmModel?: string;
  outboundMode?: OutboundMode;
  logger?: Logger;
  /** Per-process secret values (key → value), fetched from the secret store by the worker.
   *  Falls back to `AGENT_SECRET_<KEY>` env vars when omitted. */
  secrets?: Record<string, string>;
};

/** Build the toolset from explicit config (preferred — keeps the activity testable). */
export function createToolSet(env: ToolSetEnv = {}): ToolSet {
  const logger = env.logger ?? consoleLogger;
  const outboundMode = env.outboundMode ?? 'simulate';

  // No keys at all → fully offline fake (used by the example + hermetic tests).
  if (!env.composioApiKey && !env.anthropicApiKey) {
    logger.warn('No COMPOSIO/ANTHROPIC keys — using the offline fake toolset.');
    return createFakeToolSet({ logger, ...(env.secrets ? { secrets: env.secrets } : {}) });
  }

  const fake = createFakeToolSet({ logger });
  return {
    logger,
    outboundMode,
    secrets: createSecretsTool({ values: env.secrets ?? {}, logger }),
    composio:
      env.composioApiKey && env.composioUserId
        ? createComposioTools({
            apiKey: env.composioApiKey,
            userId: env.composioUserId,
            outboundMode,
            logger,
          })
        : (logger.warn('Composio not configured — composio.* will use the fake.'), fake.composio),
    llm:
      env.anthropicApiKey && env.llmModel
        ? createLlmTool({ apiKey: env.anthropicApiKey, model: env.llmModel, logger })
        : (logger.warn('Anthropic not configured — llm.* will use the fake.'), fake.llm),
  };
}

/** Read the toolset config from process.env (the worker's convenience entry). */
export function toolSetFromEnv(logger?: Logger): ToolSet {
  return createToolSet({
    composioApiKey: process.env.COMPOSIO_API_KEY,
    composioUserId: process.env.COMPOSIO_USER_ID ?? 'default',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    llmModel: process.env.AGENT_LLM_MODEL ?? process.env.AI_REVIEW_MODEL ?? 'claude-sonnet-4-5',
    outboundMode: (process.env.AGENT_OUTBOUND_MODE as OutboundMode) ?? 'simulate',
    ...(logger ? { logger } : {}),
  });
}
