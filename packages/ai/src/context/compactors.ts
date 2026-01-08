import { LanguageModelV3Message } from '@ai-sdk/provider';
import { LanguageModel } from '../types';
import { generateText } from '../generate-text';
import { Compactor } from './types';

/**
 * Creates a compactor that summarizes messages using an LLM.
 *
 * @example
 * ```ts
 * const compactor = summarize({
 *   model: openai('gpt-4o-mini'),
 * });
 * ```
 */
export function summarize(options: {
  model: LanguageModel;
  prompt?: string;
  maxTokens?: number;
}): Compactor {
  const {
    model,
    prompt = `Summarize the following conversation, preserving:
- Key decisions and conclusions
- Important facts and context
- Any commitments or action items
- The overall trajectory of the discussion

Be concise but complete. This summary will be used as context for continuing the conversation.`,
    maxTokens = 500,
  } = options;

  return async (messages: LanguageModelV3Message[]) => {
    // Convert messages to readable format for the summarizer
    const conversationText = messages
      .map(m => {
        const role = m.role.toUpperCase();
        const content = formatMessageContent(m);
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const { text } = await generateText({
      model,
      maxOutputTokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: `Here is the conversation to summarize:\n\n${conversationText}`,
        },
      ],
    });

    return {
      role: 'system',
      content: `[Previous conversation summary]\n${text}`,
    };
  };
}

/**
 * Creates a compactor that extracts key facts and context.
 *
 * @example
 * ```ts
 * const compactor = extractFacts({
 *   model: openai('gpt-4o-mini'),
 * });
 * ```
 */
export function extractFacts(options: {
  model: LanguageModel;
  prompt?: string;
  maxTokens?: number;
}): Compactor {
  const {
    model,
    prompt = `Extract the key facts, context, and decisions from this conversation.
Format as a bullet list. Include:
- User preferences and requirements stated
- Decisions made
- Technical context established
- Any constraints or limitations mentioned

Be precise and factual.`,
    maxTokens = 400,
  } = options;

  return async (messages: LanguageModelV3Message[]) => {
    const conversationText = messages
      .map(m => {
        const role = m.role.toUpperCase();
        const content = formatMessageContent(m);
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const { text } = await generateText({
      model,
      maxOutputTokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: conversationText,
        },
      ],
    });

    return {
      role: 'system',
      content: `[Key context from previous conversation]\n${text}`,
    };
  };
}

/**
 * A simple compactor that just concatenates message content.
 * Useful for testing or when you don't want to use an LLM.
 */
export function concatenate(options?: {
  maxLength?: number;
  separator?: string;
}): Compactor {
  const { maxLength = 2000, separator = '\n---\n' } = options ?? {};

  return async (messages: LanguageModelV3Message[]) => {
    let text = messages
      .map(m => {
        const role = m.role;
        const content = formatMessageContent(m);
        return `[${role}] ${content}`;
      })
      .join(separator);

    if (text.length > maxLength) {
      text = text.slice(0, maxLength - 20) + '... [truncated]';
    }

    return {
      role: 'system',
      content: `[Previous conversation]\n${text}`,
    };
  };
}

// Helper to format message content as string
function formatMessageContent(message: LanguageModelV3Message): string {
  if (message.role === 'system') {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return String(message.content);
  }

  return message.content
    .map(part => {
      if (part.type === 'text') return part.text;
      if (part.type === 'tool-call') return `[Tool: ${part.toolName}]`;
      if (part.type === 'tool-result') return `[Result: ${part.toolName}]`;
      return `[${part.type}]`;
    })
    .join(' ');
}
