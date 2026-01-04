import {
  LanguageModelV3Message,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import { defaultTokenEstimator } from './estimate-tokens';
import {
  BuildPromptOptions,
  CompactOptions,
  ContextConfig,
  ContextSnapshot,
  Segment,
} from './types';

/**
 * Context manages conversation history with support for:
 * - Cheap filtering (runs every buildPrompt)
 * - Expensive compaction (runs periodically, may use LLM)
 * - Persistence of both original messages and compacted segments
 *
 * @example
 * ```ts
 * import { Context, redactOldToolResults, summarize } from 'ai';
 *
 * const context = new Context({
 *   filters: [redactOldToolResults(5)],
 *   compactor: summarize({ model: openai('gpt-4o-mini') }),
 *   trigger: { tokens: 50000 },
 * });
 *
 * // Add messages
 * context.append({ role: 'user', content: [...] });
 *
 * // Build prompt for LLM (applies filters, uses compacted segments)
 * const prompt = await context.buildPrompt({ maxTokens: 100000 });
 *
 * // Compaction happens automatically when trigger threshold exceeded
 * // Or manually: await context.compact();
 * ```
 */
export class Context {
  private _messages: LanguageModelV3Prompt = [];
  private _segments: Segment[] = [];
  private _config: ContextConfig;
  private _compactionInProgress = false;

  constructor(config: ContextConfig = {}) {
    this._config = {
      keepRecent: 10,
      ...config,
    };
  }

  /**
   * All original messages (read-only).
   */
  get messages(): readonly LanguageModelV3Message[] {
    return this._messages;
  }

  /**
   * Cached compaction segments (read-only).
   */
  get segments(): readonly Segment[] {
    return this._segments;
  }

  /**
   * Number of messages in the context.
   */
  get length(): number {
    return this._messages.length;
  }

  /**
   * Append a message to the context.
   */
  append(message: LanguageModelV3Message): void {
    this._messages.push(message);
  }

  /**
   * Append multiple messages to the context.
   */
  appendAll(messages: LanguageModelV3Message[]): void {
    this._messages.push(...messages);
  }

  /**
   * Build a prompt for the LLM.
   *
   * This applies:
   * 1. Compacted segments (for old, compacted ranges)
   * 2. Filters (cheap, run every time)
   *
   * @returns Messages ready to send to the LLM
   */
  async buildPrompt(options: BuildPromptOptions = {}): Promise<LanguageModelV3Prompt> {
    const { maxTokens, filters: additionalFilters = [] } = options;
    const allFilters = [...(this._config.filters ?? []), ...additionalFilters];

    // Check if auto-compaction should trigger
    await this.maybeAutoCompact();

    // Start with messages not covered by segments
    const compactedUpTo = this.getCompactedUpTo();
    const uncompactedMessages = this._messages.slice(compactedUpTo);

    // Build the prompt
    const prompt: LanguageModelV3Prompt = [];

    // Add segment summaries first
    for (const segment of this._segments) {
      prompt.push(segment.content);
    }

    // Add uncompacted messages with filters applied
    const total = uncompactedMessages.length;
    for (let i = 0; i < total; i++) {
      const message = uncompactedMessages[i];
      const context = {
        index: compactedUpTo + i,
        total: this._messages.length,
        age: total - 1 - i,
      };

      let filtered: LanguageModelV3Message | null = message;
      for (const filter of allFilters) {
        if (!filtered) break;
        filtered = filter(filtered, context);
      }

      if (filtered) {
        prompt.push(filtered);
      }
    }

    // If maxTokens specified, do final token-based trimming
    if (maxTokens) {
      return this.trimToTokenBudget(prompt, maxTokens);
    }

    return prompt;
  }

  /**
   * Run compaction on old messages.
   *
   * This summarizes a chunk of old messages into a segment,
   * reducing context size while preserving key information.
   */
  async compact(options: CompactOptions = {}): Promise<Segment | null> {
    const { force = false, compactor = this._config.compactor } = options;

    if (!compactor) {
      throw new Error('No compactor configured. Provide a compactor in config or options.');
    }

    if (this._compactionInProgress) {
      return null; // Already compacting
    }

    // Determine what to compact
    const keepRecent = this._config.keepRecent ?? 10;
    const compactedUpTo = this.getCompactedUpTo();
    const uncompactedCount = this._messages.length - compactedUpTo;

    // Don't compact if not enough messages
    if (!force && uncompactedCount <= keepRecent * 2) {
      return null;
    }

    // Messages to compact: everything except the recent ones
    const compactEnd = this._messages.length - keepRecent;
    if (compactEnd <= compactedUpTo) {
      return null; // Nothing to compact
    }

    const messagesToCompact = this._messages.slice(compactedUpTo, compactEnd);
    if (messagesToCompact.length === 0) {
      return null;
    }

    this._compactionInProgress = true;

    try {
      // Run the compactor
      const summary = await compactor(messagesToCompact);

      // Create the segment
      const segment: Segment = {
        id: `segment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        range: [compactedUpTo, compactEnd],
        content: summary,
        tokens: this.estimateTokens(summary),
        createdAt: new Date(),
      };

      this._segments.push(segment);

      if (this._config.onCompact) {
        this._config.onCompact(segment);
      }

      return segment;
    } finally {
      this._compactionInProgress = false;
    }
  }

  /**
   * Check if compaction should be triggered automatically.
   */
  async shouldCompact(): Promise<boolean> {
    const trigger = this._config.trigger;
    if (!trigger) return false;

    const compactedUpTo = this.getCompactedUpTo();
    const uncompactedMessages = this._messages.slice(compactedUpTo);

    if (trigger.messages && uncompactedMessages.length > trigger.messages) {
      return true;
    }

    if (trigger.tokens) {
      let totalTokens = 0;
      for (const msg of uncompactedMessages) {
        totalTokens += this.estimateTokens(msg);
      }
      if (totalTokens > trigger.tokens) {
        return true;
      }
    }

    return false;
  }

  /**
   * Export context state for persistence.
   */
  toSnapshot(): ContextSnapshot {
    return {
      messages: [...this._messages],
      segments: [...this._segments],
      version: 1,
    };
  }

  /**
   * Restore context from a snapshot.
   */
  static fromSnapshot(snapshot: ContextSnapshot, config: ContextConfig = {}): Context {
    const context = new Context(config);
    context._messages = [...snapshot.messages];
    context._segments = [...snapshot.segments];
    return context;
  }

  /**
   * Clear all messages and segments.
   */
  clear(): void {
    this._messages = [];
    this._segments = [];
  }

  // Private helpers

  private getCompactedUpTo(): number {
    if (this._segments.length === 0) return 0;
    return Math.max(...this._segments.map(s => s.range[1]));
  }

  private async maybeAutoCompact(): Promise<void> {
    if (this._config.compactor && await this.shouldCompact()) {
      await this.compact();
    }
  }

  private estimateTokens(message: LanguageModelV3Message): number {
    const estimator = this._config.estimateTokens ?? defaultTokenEstimator;
    const result = estimator(message);
    // Handle both sync and async estimators
    return typeof result === 'number' ? result : 0;
  }

  private trimToTokenBudget(
    prompt: LanguageModelV3Prompt,
    maxTokens: number,
  ): LanguageModelV3Prompt {
    // Simple approach: keep from the end until we exceed budget
    let totalTokens = 0;
    const result: LanguageModelV3Prompt = [];

    // Always keep system messages and segments at the start
    const systemMessages: LanguageModelV3Prompt = [];
    const otherMessages: LanguageModelV3Prompt = [];

    for (const msg of prompt) {
      if (msg.role === 'system') {
        systemMessages.push(msg);
        totalTokens += this.estimateTokens(msg);
      } else {
        otherMessages.push(msg);
      }
    }

    // Add system messages
    result.push(...systemMessages);

    // Add other messages from the end until budget exceeded
    const remainingBudget = maxTokens - totalTokens;
    let usedTokens = 0;
    const keptMessages: LanguageModelV3Prompt = [];

    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msg = otherMessages[i];
      const tokens = this.estimateTokens(msg);

      if (usedTokens + tokens <= remainingBudget) {
        keptMessages.unshift(msg);
        usedTokens += tokens;
      } else {
        break;
      }
    }

    result.push(...keptMessages);
    return result;
  }
}

/**
 * Create a new context with the given configuration.
 */
export function createContext(config: ContextConfig = {}): Context {
  return new Context(config);
}
