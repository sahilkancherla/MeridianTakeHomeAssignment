/**
 * Secret resolution for the agent skeleton.
 *
 * A `System` card declares which credentials it needs (by `key`); the VALUES live in the
 * owner-scoped secret store and never travel in the spec. In production, the worker fetches
 * the per-process secret map from that store and passes it here as `values`. Offline (the
 * example + hermetic evals), values fall back to the environment as `AGENT_SECRET_<KEY>`,
 * so a clone runs with zero config and wiring real secrets is just setting env vars.
 *
 * Resolution happens inside the Temporal activity (the only place I/O is allowed); the
 * resolved value is handed straight to a tool call and is never written to a fact, the
 * trace, or a log line — only a missing-secret *warning* (the key, never the value) is logged.
 */

import type { Logger, SecretsTool } from './types.js';

export type SecretsOptions = {
  /** Per-process secret values, keyed by the System card's declared secret `key`. */
  values?: Record<string, string>;
  logger?: Logger;
};

/** Env var name a secret falls back to when not supplied in `values`: `AGENT_SECRET_<KEY>`. */
export function secretEnvVar(key: string): string {
  return `AGENT_SECRET_${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

export function createSecretsTool(opts: SecretsOptions = {}): SecretsTool {
  const values = opts.values ?? {};
  return {
    async get(key: string): Promise<string | undefined> {
      const v = values[key] ?? process.env[secretEnvVar(key)];
      if (v == null) opts.logger?.warn(`secret "${key}" is not configured`, { envVar: secretEnvVar(key) });
      return v;
    },
  };
}
