import {
  LanguageModelV3Message,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';

/**
 * Function to estimate tokens in a message.
 */
export type TokenEstimator = (
  message: LanguageModelV3Message,
) => number | Promise<number>;

/**
 * A segment is a compacted chunk of message history.
 * It represents a summary of a range of messages.
 */
export interface Segment {
  /**
   * Unique identifier for this segment.
   */
  id: string;

  /**
   * Range of message indices this segment covers [start, end).
   */
  range: [number, number];

  /**
   * The compressed representation (e.g., a summary message).
   */
  content: LanguageModelV3Message;

  /**
   * Estimated tokens in the compressed content.
   */
  tokens: number;

  /**
   * When this segment was created.
   */
  createdAt: Date;
}

/**
 * Context passed to filters.
 */
export interface FilterContext {
  /**
   * Index of the message in the full history.
   */
  index: number;

  /**
   * Total number of messages.
   */
  total: number;

  /**
   * Distance from the most recent message (0 = most recent).
   */
  age: number;
}

/**
 * A filter transforms messages before they're sent to the LLM.
 * Filters are cheap and run on every call.
 */
export type Filter = (
  message: LanguageModelV3Message,
  context: FilterContext,
) => LanguageModelV3Message | null; // null = remove

/**
 * A compactor creates a segment from a range of messages.
 * Compactors are expensive (may use LLM) and run periodically.
 */
export type Compactor = (
  messages: LanguageModelV3Message[],
) => Promise<LanguageModelV3Message>;

/**
 * Options for building a prompt from context.
 */
export interface BuildPromptOptions {
  /**
   * Maximum tokens for the prompt.
   */
  maxTokens?: number;

  /**
   * Additional filters to apply (beyond those in context config).
   */
  filters?: Filter[];
}

/**
 * Options for triggering compaction.
 */
export interface CompactOptions {
  /**
   * Force compaction even if threshold not reached.
   */
  force?: boolean;

  /**
   * Custom compactor to use (overrides config).
   */
  compactor?: Compactor;
}

/**
 * When to trigger automatic compaction.
 */
export interface CompactionTrigger {
  /**
   * Compact when total tokens exceed this.
   */
  tokens?: number;

  /**
   * Compact when message count exceeds this.
   */
  messages?: number;
}

/**
 * Configuration for the context manager.
 */
export interface ContextConfig {
  /**
   * Filters to apply when building prompts.
   * Filters are cheap and run on every buildPrompt() call.
   */
  filters?: Filter[];

  /**
   * Compactor function to use for summarization.
   */
  compactor?: Compactor;

  /**
   * When to automatically trigger compaction.
   */
  trigger?: CompactionTrigger;

  /**
   * How many recent messages to keep uncompacted.
   * Default: 10
   */
  keepRecent?: number;

  /**
   * Token estimator function.
   */
  estimateTokens?: (message: LanguageModelV3Message) => number;

  /**
   * Callback when compaction occurs.
   */
  onCompact?: (segment: Segment) => void;
}

/**
 * Snapshot of context state for persistence.
 */
export interface ContextSnapshot {
  /**
   * All original messages.
   */
  messages: LanguageModelV3Prompt;

  /**
   * Cached compaction segments.
   */
  segments: Segment[];

  /**
   * Version for migrations.
   */
  version: number;
}
