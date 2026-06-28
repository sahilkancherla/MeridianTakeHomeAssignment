/**
 * The tool surface — the "place for tool calls" in the skeleton.
 *
 * Deliberately **general**, not Gmail-specific. A spec describes which systems a
 * process touches via its `System` cards (`integration: "composio.gmail"`, etc.); the
 * generated agent then calls whichever Composio tools those systems imply. So the
 * skeleton exposes *all* of Composio behind one `execute(toolSlug, args)` method rather
 * than a fixed menu — any toolkit Composio supports (Gmail, Slack, Sheets, a WMS HTTP
 * tool, …) is reachable without changing the skeleton.
 *
 * Two cross-cutting policies live here so every generated agent inherits them for free:
 *   • read vs. write — every call declares its side effect; `write` calls are gated by
 *     the outbound mode, so "read the inbox for real, simulate the replies" is enforced
 *     centrally (the take-home's chosen posture) rather than per handler.
 *   • the LLM is a tool too — extraction/judgment steps ("pull the PO number", "are
 *     these values consistent?") call `llm`, which an activity runs like any other tool.
 */

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export type OutboundMode = 'live' | 'simulate';

/** Whether a tool call observes state or changes the outside world. Outbound `write`
 *  calls are the ones the `simulate` mode intercepts. */
export type SideEffect = 'read' | 'write';

export type ToolResult = {
  ok: boolean;
  data: unknown;
  /** True when an outbound `write` was logged instead of really sent (simulate mode). */
  simulated?: boolean;
  error?: string;
};

export type ComposioExecuteOptions = {
  /** Defaults to 'read'. 'write' calls are simulated unless outboundMode === 'live'. */
  sideEffect?: SideEffect;
  /** Composio connected-account user id; defaults to the toolset's configured user. */
  userId?: string;
};

/** General access to every Composio tool. One method, any toolkit/slug. */
export interface ComposioTools {
  execute(
    toolSlug: string,
    args: Record<string, unknown>,
    opts?: ComposioExecuteOptions,
  ): Promise<ToolResult>;
}

/** The LLM, exposed as a tool. `complete` for free-form text, `extract` for forced
 *  structured output (the workhorse for document understanding). */
export interface LlmTool {
  complete(opts: { system?: string; prompt: string; maxTokens?: number }): Promise<string>;
  extract<T = unknown>(opts: {
    instructions: string;
    input: string;
    /** JSON-schema-ish shape the model must return; passed through to the provider. */
    schema: Record<string, unknown>;
    maxTokens?: number;
  }): Promise<T>;
}

/**
 * Resolves a System's declared credentials at runtime. A `System` card declares which
 * secrets it needs (by `key`); the actual values live in the owner-scoped secret store
 * (never in the spec) and are injected into this resolver inside the activity. A handler
 * fetches one with `await ctx.tools.secrets.get('gmail_app_password')` and hands it to the
 * relevant Composio connected account / tool call — keeping secret values off the
 * blackboard, out of the trace, and out of logs.
 */
export interface SecretsTool {
  get(key: string): Promise<string | undefined>;
}

/** The complete toolbox handed to every step handler. Generated logic uses whatever
 *  subset its card needs; the skeleton makes the whole set available uniformly. */
export interface ToolSet {
  composio: ComposioTools;
  llm: LlmTool;
  /** Resolves a System's declared secrets (by key) at execution time. */
  secrets: SecretsTool;
  logger: Logger;
  /** Current outbound posture, so a handler can branch on it if it must. */
  outboundMode: OutboundMode;
}
