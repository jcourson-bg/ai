import { LanguageModelV3Message } from '@ai-sdk/provider';

/**
 * Function to estimate tokens in a message.
 */
export type TokenEstimator = (
  message: LanguageModelV3Message,
) => number | Promise<number>;

/**
 * Context for the priority function.
 */
export interface PriorityContext {
  /**
   * Index of the message (0 = oldest).
   */
  index: number;

  /**
   * Total number of messages.
   */
  total: number;

  /**
   * Estimated token count for this message.
   */
  tokens: number;
}

/**
 * Function to determine message priority.
 *
 * Return a number. Higher = more important = kept longer.
 * Return `Infinity` to always keep a message (pinned).
 * Return `-Infinity` to always drop a message.
 */
export type PriorityFunction = (
  message: LanguageModelV3Message,
  context: PriorityContext,
) => number;

/**
 * Information about messages that were dropped.
 */
export interface DropInfo {
  /**
   * Number of messages dropped.
   */
  count: number;

  /**
   * Total tokens in dropped messages.
   */
  tokens: number;

  /**
   * The messages that were dropped (in original order).
   */
  messages: LanguageModelV3Message[];
}

/**
 * Result of selecting messages for the context window.
 */
export interface SelectResult {
  /**
   * Messages to keep (in original order).
   */
  messages: LanguageModelV3Message[];

  /**
   * Total tokens in kept messages.
   */
  tokens: number;

  /**
   * Information about dropped messages, if any.
   */
  dropped?: DropInfo;
}

/**
 * Configuration for the context window middleware.
 */
export interface ContextWindowOptions {
  /**
   * Maximum tokens for the prompt.
   */
  maxTokens: number;

  /**
   * Function to determine message priority.
   *
   * Higher priority = more important = kept longer.
   * Return `Infinity` to pin a message (always keep).
   *
   * @default Recency-based (newer messages have higher priority)
   *
   * @example Keep system messages, prioritize user messages
   * ```ts
   * priority: (message, { index }) => {
   *   if (message.role === 'system') return Infinity;
   *   if (message.role === 'user') return 1000 + index;
   *   if (message.role === 'tool') return index;
   *   return 500 + index;
   * }
   * ```
   */
  priority?: PriorityFunction;

  /**
   * Custom token estimator.
   *
   * @default Character-based estimation (~3.5 chars/token)
   */
  estimateTokens?: TokenEstimator;

  /**
   * Callback when messages are dropped.
   */
  onDrop?: (info: DropInfo) => void;
}
