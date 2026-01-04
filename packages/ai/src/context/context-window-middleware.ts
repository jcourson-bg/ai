import { LanguageModelV3Middleware } from '@ai-sdk/provider';
import { selectContext } from './select-context';
import { ContextWindowOptions } from './types';

/**
 * Creates middleware that automatically manages the context window.
 *
 * Messages are selected based on their priority score.
 * Higher priority = more important = kept longer.
 *
 * @example Basic usage with default recency-based selection
 * ```ts
 * import { wrapLanguageModel, contextWindow } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * const model = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: contextWindow({ maxTokens: 100000 }),
 * });
 * ```
 *
 * @example Custom priority function
 * ```ts
 * contextWindow({
 *   maxTokens: 100000,
 *   priority: (message, { index }) => {
 *     if (message.role === 'system') return Infinity; // Always keep
 *     if (message.role === 'user') return 1000 + index;
 *     if (message.role === 'tool') return index;
 *     return 500 + index;
 *   },
 * })
 * ```
 *
 * @example Using built-in priority helpers
 * ```ts
 * import { contextWindow, byRole } from 'ai';
 *
 * contextWindow({
 *   maxTokens: 100000,
 *   priority: byRole({
 *     system: Infinity,
 *     user: 1000,
 *     assistant: 500,
 *     tool: 100,
 *   }),
 * })
 * ```
 */
export function contextWindow(
  options: ContextWindowOptions,
): LanguageModelV3Middleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const result = await selectContext(params.prompt, options);

      if (result.dropped && options.onDrop) {
        options.onDrop(result.dropped);
      }

      return {
        ...params,
        prompt: result.messages,
      };
    },
  };
}

/**
 * Common model context window sizes.
 */
export const modelContextLimits = {
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o1-mini': 128000,
  'o3-mini': 200000,

  // Anthropic
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,

  // Google
  'gemini-2.0-flash': 1000000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,

  // Others
  'deepseek-chat': 64000,
  'llama-3.1-405b': 128000,
  'llama-3.1-70b': 128000,
  'mistral-large': 128000,
} as const;

export type KnownModel = keyof typeof modelContextLimits;

/**
 * Creates context window middleware for a known model.
 *
 * @example
 * ```ts
 * import { wrapLanguageModel, forModel } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * const model = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: forModel('gpt-4o', {
 *     priority: (msg, { index }) => {
 *       if (msg.role === 'system') return Infinity;
 *       return index;
 *     },
 *   }),
 * });
 * ```
 */
export function forModel(
  model: KnownModel,
  options?: Omit<ContextWindowOptions, 'maxTokens'>,
): LanguageModelV3Middleware {
  return contextWindow({
    maxTokens: modelContextLimits[model],
    ...options,
  });
}
