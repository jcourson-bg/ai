import {
  LanguageModelV3Message,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import { defaultTokenEstimator } from './estimate-tokens';
import { recency } from './priority';
import { ContextWindowOptions, SelectResult } from './types';

interface ScoredMessage {
  message: LanguageModelV3Message;
  index: number;
  tokens: number;
  priority: number;
}

/**
 * Selects messages that fit within the token budget,
 * keeping higher-priority messages.
 */
export async function selectContext(
  prompt: LanguageModelV3Prompt,
  options: ContextWindowOptions,
): Promise<SelectResult> {
  const {
    maxTokens,
    priority = recency,
    estimateTokens = defaultTokenEstimator,
  } = options;

  const total = prompt.length;

  // Score all messages
  const scored: ScoredMessage[] = await Promise.all(
    prompt.map(async (message, index) => {
      const tokens = await estimateTokens(message);
      const priorityScore = priority(message, { index, total, tokens });
      return { message, index, tokens, priority: priorityScore };
    }),
  );

  // Separate pinned (Infinity) from regular messages
  const pinned = scored.filter(m => m.priority === Infinity);
  const regular = scored.filter(m => m.priority !== Infinity && m.priority !== -Infinity);
  const dropped = scored.filter(m => m.priority === -Infinity);

  // Calculate pinned tokens
  const pinnedTokens = pinned.reduce((sum, m) => sum + m.tokens, 0);
  let remainingBudget = maxTokens - pinnedTokens;

  // Sort regular messages by priority (highest first)
  regular.sort((a, b) => b.priority - a.priority);

  // Select messages that fit
  const selected: ScoredMessage[] = [...pinned];
  const droppedMessages: ScoredMessage[] = [...dropped];

  for (const msg of regular) {
    if (msg.tokens <= remainingBudget) {
      selected.push(msg);
      remainingBudget -= msg.tokens;
    } else {
      droppedMessages.push(msg);
    }
  }

  // Restore original order
  selected.sort((a, b) => a.index - b.index);
  droppedMessages.sort((a, b) => a.index - b.index);

  const result: SelectResult = {
    messages: selected.map(m => m.message),
    tokens: maxTokens - remainingBudget,
  };

  if (droppedMessages.length > 0) {
    result.dropped = {
      count: droppedMessages.length,
      tokens: droppedMessages.reduce((sum, m) => sum + m.tokens, 0),
      messages: droppedMessages.map(m => m.message),
    };
  }

  return result;
}
