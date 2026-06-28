/**
 * The real LLM tool — Anthropic. Powers the "understanding" steps of an agent:
 * extracting fields from a document, judging cross-document consistency, summarizing.
 * Runs inside a Temporal activity (it does network I/O), never the workflow.
 *
 * `extract` forces structured output via a single-tool tool_use call, which is stable
 * across SDK versions and guarantees the handler gets JSON it can trust rather than
 * prose it has to parse.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LlmTool, Logger } from './types.js';

export type LlmToolOptions = {
  apiKey: string;
  model: string;
  logger: Logger;
};

export function createLlmTool(opts: LlmToolOptions): LlmTool {
  const client = new Anthropic({ apiKey: opts.apiKey });

  return {
    async complete({ system, prompt, maxTokens = 2048 }) {
      const msg = await client.messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      return msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
    },

    async extract<T>({
      instructions,
      input,
      schema,
      maxTokens = 2048,
    }: {
      instructions: string;
      input: string;
      schema: Record<string, unknown>;
      maxTokens?: number;
    }): Promise<T> {
      const msg = await client.messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        tools: [
          {
            name: 'emit',
            description: 'Return the extracted result in the required shape.',
            input_schema: schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'emit' },
        messages: [{ role: 'user', content: `${instructions}\n\n---\n${input}` }],
      });
      const tool = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (!tool) {
        opts.logger.warn('llm.extract returned no tool_use block');
        return {} as T;
      }
      return tool.input as T;
    },
  };
}
