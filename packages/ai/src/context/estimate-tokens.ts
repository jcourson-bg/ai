import { LanguageModelV3Message, LanguageModelV3Prompt } from '@ai-sdk/provider';
import { TokenEstimator } from './types';

/**
 * Default character-to-token ratio used for estimation.
 *
 * This is a conservative estimate based on:
 * - English text: ~4 characters per token
 * - Code: ~3.5 characters per token
 * - JSON/structured data: ~3 characters per token
 *
 * We use 3.5 as a balanced default.
 */
const DEFAULT_CHARS_PER_TOKEN = 3.5;

/**
 * Overhead tokens per message for role, formatting, etc.
 * Most models add a few tokens per message for role markers.
 */
const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Estimates the token count for a text string.
 */
export function estimateTextTokens(
  text: string,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): number {
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Serializes message content to a string for token estimation.
 */
function serializeMessageContent(message: LanguageModelV3Message): string {
  const parts: string[] = [];

  // Add role
  parts.push(message.role);

  if (message.role === 'system') {
    parts.push(message.content);
  } else if (message.role === 'user' || message.role === 'assistant') {
    for (const part of message.content) {
      switch (part.type) {
        case 'text':
          parts.push(part.text);
          break;
        case 'reasoning':
          parts.push(part.text);
          break;
        case 'tool-call':
          parts.push(part.toolName);
          parts.push(JSON.stringify(part.input));
          break;
        case 'tool-result':
          parts.push(part.toolName);
          parts.push(JSON.stringify(part.output));
          break;
        case 'file':
          // Files are complex - estimate based on data type
          if (typeof part.data === 'string') {
            // URL or base64 - base64 is roughly 4/3 the size
            parts.push(part.data);
          } else if (part.data instanceof URL) {
            parts.push(part.data.toString());
          } else {
            // Uint8Array - very rough estimate
            parts.push(`[binary data: ${part.data.length} bytes]`);
          }
          break;
      }
    }
  } else if (message.role === 'tool') {
    for (const part of message.content) {
      if (part.type === 'tool-result') {
        parts.push(JSON.stringify(part.output));
      }
    }
  }

  return parts.join(' ');
}

/**
 * Default token estimator using character-based approximation.
 *
 * This provides a fast, dependency-free estimation that's
 * generally accurate within 10-15% for most content.
 */
export const defaultTokenEstimator: TokenEstimator = (
  message: LanguageModelV3Message,
): number => {
  const content = serializeMessageContent(message);
  return estimateTextTokens(content) + MESSAGE_OVERHEAD_TOKENS;
};

/**
 * Estimates total tokens for a prompt (array of messages).
 */
export async function estimatePromptTokens(
  prompt: LanguageModelV3Prompt,
  estimator: TokenEstimator = defaultTokenEstimator,
): Promise<number> {
  let total = 0;
  for (const message of prompt) {
    const count = await estimator(message);
    total += count;
  }
  return total;
}

/**
 * Creates a token estimator with a custom characters-per-token ratio.
 *
 * Use this if you know your content has a different density:
 * - Dense code: 3.0-3.5 chars/token
 * - English prose: 4.0-4.5 chars/token
 * - Technical docs: 3.5-4.0 chars/token
 */
export function createCharacterBasedEstimator(
  charsPerToken: number,
): TokenEstimator {
  return (message: LanguageModelV3Message): number => {
    const content = serializeMessageContent(message);
    return estimateTextTokens(content, charsPerToken) + MESSAGE_OVERHEAD_TOKENS;
  };
}
