import { LanguageModelV3Middleware } from '@ai-sdk/provider';
import { pruneContext } from './prune-context';
import { ContextWindowConfig } from './types';

/**
 * Creates a middleware that manages the context window by automatically
 * pruning messages to fit within the specified token limit.
 *
 * This middleware transparently manages your conversation history so you
 * don't have to manually track token counts or implement pruning logic.
 *
 * @example Basic usage
 * ```ts
 * import { openai } from '@ai-sdk/openai';
 * import { contextWindow, wrapLanguageModel, generateText } from 'ai';
 *
 * const model = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: contextWindow({ maxPromptTokens: 100000 }),
 * });
 *
 * // Now you can pass arbitrarily long message histories
 * // and the middleware will automatically prune to fit
 * const result = await generateText({
 *   model,
 *   messages: veryLongMessageHistory,
 * });
 * ```
 *
 * @example With custom strategy
 * ```ts
 * const model = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: contextWindow({
 *     maxPromptTokens: 100000,
 *     strategy: 'priority-based',
 *     assignPriority: (message, index, messages) => {
 *       // Keep user messages with high priority
 *       if (message.role === 'user') return 'high';
 *       // Tool results can be regenerated
 *       if (message.role === 'tool') return 'low';
 *       return 'normal';
 *     },
 *     onPrune: (result) => {
 *       console.log(`Pruned ${result.removedCount} messages`);
 *     },
 *   }),
 * });
 * ```
 *
 * @example With real tokenizer
 * ```ts
 * import { encodingForModel } from 'js-tiktoken';
 *
 * const enc = encodingForModel('gpt-4o');
 *
 * const model = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: contextWindow({
 *     maxPromptTokens: 100000,
 *     estimateTokens: (message) => {
 *       const text = JSON.stringify(message);
 *       return enc.encode(text).length;
 *     },
 *   }),
 * });
 * ```
 */
export function contextWindow(
  config: ContextWindowConfig,
): LanguageModelV3Middleware {
  return {
    specificationVersion: 'v3',

    transformParams: async ({ params }) => {
      const { prompt, ...rest } = params;

      // Prune the prompt to fit within the token limit
      const result = await pruneContext(prompt, config);

      // Call the onPrune callback if messages were removed
      if (result.removedCount > 0 && config.onPrune) {
        config.onPrune(result);
      }

      return {
        ...rest,
        prompt: result.messages,
      };
    },
  };
}

/**
 * Common context window presets for popular models.
 *
 * These presets provide sensible defaults for token limits,
 * leaving room for output generation.
 */
export const contextWindowPresets = {
  /**
   * GPT-4o: 128k context, reserve 28k for output
   */
  'gpt-4o': {
    maxPromptTokens: 100000,
  },

  /**
   * GPT-4o-mini: 128k context, reserve 16k for output
   */
  'gpt-4o-mini': {
    maxPromptTokens: 112000,
  },

  /**
   * Claude 3.5 Sonnet: 200k context, reserve 8k for output
   */
  'claude-3-5-sonnet': {
    maxPromptTokens: 192000,
  },

  /**
   * Claude 3 Haiku: 200k context, reserve 4k for output
   */
  'claude-3-haiku': {
    maxPromptTokens: 196000,
  },

  /**
   * Gemini 1.5 Pro: 2M context, reserve 8k for output
   */
  'gemini-1-5-pro': {
    maxPromptTokens: 2000000,
  },

  /**
   * Gemini 1.5 Flash: 1M context, reserve 8k for output
   */
  'gemini-1-5-flash': {
    maxPromptTokens: 1000000,
  },

  /**
   * GPT-4: 8k context, reserve 2k for output
   */
  'gpt-4': {
    maxPromptTokens: 6000,
  },

  /**
   * GPT-4 32k: 32k context, reserve 4k for output
   */
  'gpt-4-32k': {
    maxPromptTokens: 28000,
  },

  /**
   * GPT-3.5 Turbo: 16k context, reserve 4k for output
   */
  'gpt-3-5-turbo': {
    maxPromptTokens: 12000,
  },
} as const satisfies Record<string, Partial<ContextWindowConfig>>;

/**
 * Creates a context window middleware using a model preset.
 *
 * @example
 * ```ts
 * const model = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: contextWindowForModel('gpt-4o'),
 * });
 * ```
 */
export function contextWindowForModel(
  modelName: keyof typeof contextWindowPresets,
  overrides?: Partial<ContextWindowConfig>,
): LanguageModelV3Middleware {
  const preset = contextWindowPresets[modelName];
  return contextWindow({
    ...preset,
    ...overrides,
  });
}
