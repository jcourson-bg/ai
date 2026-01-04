import { LanguageModelV3Message } from '@ai-sdk/provider';

/**
 * Token estimation function type.
 * Used to estimate the number of tokens in a message.
 */
export type TokenEstimator = (
  message: LanguageModelV3Message,
) => number | Promise<number>;

/**
 * Priority level for messages in the context window.
 * Higher priority messages are kept when pruning is needed.
 */
export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Annotated message with priority and metadata for context management.
 */
export interface AnnotatedMessage {
  /**
   * The original message.
   */
  message: LanguageModelV3Message;

  /**
   * Priority level of this message.
   * @default 'normal'
   */
  priority: MessagePriority;

  /**
   * Estimated token count for this message.
   */
  tokenCount: number;

  /**
   * Original index in the message array.
   */
  originalIndex: number;

  /**
   * Whether this message is pinned and should never be removed.
   */
  pinned: boolean;
}

/**
 * Result of a pruning operation.
 */
export interface PruneResult {
  /**
   * The pruned messages that fit within the token limit.
   */
  messages: LanguageModelV3Message[];

  /**
   * Total estimated tokens in the pruned messages.
   */
  totalTokens: number;

  /**
   * Number of messages that were removed.
   */
  removedCount: number;

  /**
   * Indices of messages that were removed (from original array).
   */
  removedIndices: number[];
}

/**
 * Strategy for selecting which messages to remove when pruning.
 */
export type PruningStrategy =
  | 'sliding-window' // Keep most recent messages
  | 'keep-boundaries' // Keep first + last messages, remove middle
  | 'priority-based'; // Remove lowest priority first, then oldest

/**
 * Configuration for the context window middleware.
 */
export interface ContextWindowConfig {
  /**
   * Maximum number of tokens allowed for the prompt.
   * This should be less than the model's context window to leave room for output.
   *
   * @example 100000 for GPT-4o (128k context - 28k for output)
   */
  maxPromptTokens: number;

  /**
   * Strategy for pruning messages when the context exceeds the limit.
   *
   * - `'sliding-window'`: Keep the most recent messages (default)
   * - `'keep-boundaries'`: Keep system message and recent messages, remove middle
   * - `'priority-based'`: Remove lowest priority messages first
   *
   * @default 'sliding-window'
   */
  strategy?: PruningStrategy;

  /**
   * Number of recent messages to always keep (regardless of strategy).
   * System messages are always kept.
   *
   * @default 2
   */
  keepRecentMessages?: number;

  /**
   * Reserved token budget for the system message(s).
   * If system messages exceed this, they will be truncated.
   *
   * @default 2000
   */
  systemTokenBudget?: number;

  /**
   * Custom token estimator function.
   * By default uses a character-based approximation.
   *
   * You can provide a real tokenizer for more accurate results:
   * @example
   * ```ts
   * import { encodingForModel } from 'js-tiktoken';
   * const enc = encodingForModel('gpt-4o');
   *
   * contextWindow({
   *   maxPromptTokens: 100000,
   *   estimateTokens: (msg) => {
   *     const text = JSON.stringify(msg);
   *     return enc.encode(text).length;
   *   }
   * })
   * ```
   */
  estimateTokens?: TokenEstimator;

  /**
   * Function to assign priorities to messages.
   * By default, all messages have 'normal' priority.
   *
   * @example
   * ```ts
   * assignPriority: (message, index, messages) => {
   *   // Keep all user messages with high priority
   *   if (message.role === 'user') return 'high';
   *   // Mark tool results as low priority (can be regenerated)
   *   if (message.role === 'tool') return 'low';
   *   return 'normal';
   * }
   * ```
   */
  assignPriority?: (
    message: LanguageModelV3Message,
    index: number,
    messages: LanguageModelV3Message[],
  ) => MessagePriority;

  /**
   * Callback when messages are pruned.
   * Useful for logging or debugging.
   */
  onPrune?: (result: PruneResult) => void;
}

/**
 * Priority weights for sorting.
 */
export const PRIORITY_WEIGHTS: Record<MessagePriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};
