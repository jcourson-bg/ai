import { LanguageModelV3Message, LanguageModelV3Prompt } from '@ai-sdk/provider';
import { defaultTokenEstimator } from './estimate-tokens';
import {
  AnnotatedMessage,
  ContextWindowConfig,
  MessagePriority,
  PRIORITY_WEIGHTS,
  PruneResult,
  PruningStrategy,
  TokenEstimator,
} from './types';

/**
 * Default priority assignment function.
 * System messages are critical, recent messages are high priority.
 */
function defaultAssignPriority(
  message: LanguageModelV3Message,
  index: number,
  messages: LanguageModelV3Message[],
): MessagePriority {
  // System messages are always critical
  if (message.role === 'system') {
    return 'critical';
  }

  // Last few messages get high priority
  const isRecent = index >= messages.length - 3;
  if (isRecent) {
    return 'high';
  }

  // Tool messages are lower priority (results can be regenerated)
  if (message.role === 'tool') {
    return 'low';
  }

  return 'normal';
}

/**
 * Annotates messages with token counts and priorities.
 */
async function annotateMessages(
  messages: LanguageModelV3Prompt,
  estimator: TokenEstimator,
  assignPriority: (
    message: LanguageModelV3Message,
    index: number,
    messages: LanguageModelV3Message[],
  ) => MessagePriority,
  keepRecentCount: number,
): Promise<AnnotatedMessage[]> {
  const annotated: AnnotatedMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const tokenCount = await estimator(message);
    const priority = assignPriority(message, i, messages);

    // Pin system messages and recent messages
    const isSystem = message.role === 'system';
    const isRecent = i >= messages.length - keepRecentCount;
    const pinned = isSystem || isRecent;

    annotated.push({
      message,
      priority,
      tokenCount,
      originalIndex: i,
      pinned,
    });
  }

  return annotated;
}

/**
 * Sliding window strategy: Keep most recent messages that fit.
 */
function applySlidingWindowStrategy(
  annotated: AnnotatedMessage[],
  maxTokens: number,
): AnnotatedMessage[] {
  const result: AnnotatedMessage[] = [];
  let currentTokens = 0;

  // Always include pinned messages first (system + recent)
  const pinned = annotated.filter(m => m.pinned);
  const unpinned = annotated.filter(m => !m.pinned);

  for (const msg of pinned) {
    currentTokens += msg.tokenCount;
    result.push(msg);
  }

  // If pinned already exceeds limit, return just pinned
  if (currentTokens >= maxTokens) {
    return result;
  }

  // Add unpinned messages from most recent to oldest
  const reversedUnpinned = [...unpinned].reverse();

  for (const msg of reversedUnpinned) {
    if (currentTokens + msg.tokenCount <= maxTokens) {
      currentTokens += msg.tokenCount;
      result.push(msg);
    }
  }

  // Sort by original index to maintain order
  return result.sort((a, b) => a.originalIndex - b.originalIndex);
}

/**
 * Keep boundaries strategy: Keep first (system) and last messages, remove middle.
 */
function applyKeepBoundariesStrategy(
  annotated: AnnotatedMessage[],
  maxTokens: number,
): AnnotatedMessage[] {
  const result: AnnotatedMessage[] = [];
  let currentTokens = 0;

  // Separate by position
  const systemMessages = annotated.filter(m => m.message.role === 'system');
  const nonSystemMessages = annotated.filter(m => m.message.role !== 'system');

  // Always include system messages
  for (const msg of systemMessages) {
    currentTokens += msg.tokenCount;
    result.push(msg);
  }

  // Include recent messages
  const recentCount = Math.min(3, nonSystemMessages.length);
  const recentMessages = nonSystemMessages.slice(-recentCount);
  const middleMessages = nonSystemMessages.slice(0, -recentCount);

  for (const msg of recentMessages) {
    currentTokens += msg.tokenCount;
    result.push(msg);
  }

  // Fill remaining space with middle messages (oldest first to maintain coherence)
  for (const msg of middleMessages) {
    if (currentTokens + msg.tokenCount <= maxTokens) {
      currentTokens += msg.tokenCount;
      result.push(msg);
    }
  }

  // Sort by original index
  return result.sort((a, b) => a.originalIndex - b.originalIndex);
}

/**
 * Priority-based strategy: Remove lowest priority messages first.
 */
function applyPriorityBasedStrategy(
  annotated: AnnotatedMessage[],
  maxTokens: number,
): AnnotatedMessage[] {
  // Sort by priority (descending), then by recency (more recent = higher)
  const sorted = [...annotated].sort((a, b) => {
    const priorityDiff =
      PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    // More recent messages come first (higher original index = more recent)
    return b.originalIndex - a.originalIndex;
  });

  const result: AnnotatedMessage[] = [];
  let currentTokens = 0;

  // Take messages in priority order until we hit the limit
  for (const msg of sorted) {
    if (currentTokens + msg.tokenCount <= maxTokens) {
      currentTokens += msg.tokenCount;
      result.push(msg);
    }
  }

  // Sort by original index to restore message order
  return result.sort((a, b) => a.originalIndex - b.originalIndex);
}

/**
 * Apply the pruning strategy to fit messages within token limit.
 */
function applyStrategy(
  annotated: AnnotatedMessage[],
  strategy: PruningStrategy,
  maxTokens: number,
): AnnotatedMessage[] {
  switch (strategy) {
    case 'sliding-window':
      return applySlidingWindowStrategy(annotated, maxTokens);
    case 'keep-boundaries':
      return applyKeepBoundariesStrategy(annotated, maxTokens);
    case 'priority-based':
      return applyPriorityBasedStrategy(annotated, maxTokens);
    default:
      return applySlidingWindowStrategy(annotated, maxTokens);
  }
}

/**
 * Prunes a prompt to fit within the token limit using the specified strategy.
 *
 * @param prompt - The messages to prune
 * @param config - Configuration for pruning
 * @returns The pruned messages and metadata
 */
export async function pruneContext(
  prompt: LanguageModelV3Prompt,
  config: ContextWindowConfig,
): Promise<PruneResult> {
  const {
    maxPromptTokens,
    strategy = 'sliding-window',
    keepRecentMessages = 2,
    estimateTokens = defaultTokenEstimator,
    assignPriority = defaultAssignPriority,
  } = config;

  // Annotate all messages with token counts and priorities
  const annotated = await annotateMessages(
    prompt,
    estimateTokens,
    assignPriority,
    keepRecentMessages,
  );

  // Calculate current total
  const totalTokens = annotated.reduce((sum, m) => sum + m.tokenCount, 0);

  // If already within limit, return as-is
  if (totalTokens <= maxPromptTokens) {
    return {
      messages: prompt,
      totalTokens,
      removedCount: 0,
      removedIndices: [],
    };
  }

  // Apply the pruning strategy
  const kept = applyStrategy(annotated, strategy, maxPromptTokens);
  const keptIndices = new Set(kept.map(m => m.originalIndex));

  // Find removed messages
  const removedIndices: number[] = [];
  for (let i = 0; i < prompt.length; i++) {
    if (!keptIndices.has(i)) {
      removedIndices.push(i);
    }
  }

  // Calculate final token count
  const finalTokens = kept.reduce((sum, m) => sum + m.tokenCount, 0);

  return {
    messages: kept.map(m => m.message),
    totalTokens: finalTokens,
    removedCount: removedIndices.length,
    removedIndices,
  };
}
