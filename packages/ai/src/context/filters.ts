import { LanguageModelV3Message } from '@ai-sdk/provider';
import { Filter, FilterContext } from './types';

/**
 * Redacts messages matching a predicate, replacing with a placeholder.
 *
 * @example Redact old tool results
 * ```ts
 * redact(
 *   (msg, { age }) => msg.role === 'tool' && age > 10,
 *   '[Tool result omitted]'
 * )
 * ```
 */
export function redact(
  predicate: (message: LanguageModelV3Message, context: FilterContext) => boolean,
  placeholder: string = '[Content redacted for context management]',
): Filter {
  return (message, context) => {
    if (predicate(message, context)) {
      // Return a minimal placeholder message
      if (message.role === 'system') {
        return { role: 'system', content: placeholder };
      }
      if (message.role === 'user') {
        return { role: 'user', content: [{ type: 'text', text: placeholder }] };
      }
      if (message.role === 'assistant') {
        return { role: 'assistant', content: [{ type: 'text', text: placeholder }] };
      }
      // For tool messages, we might want to drop entirely
      return null;
    }
    return message;
  };
}

/**
 * Removes messages matching a predicate entirely.
 *
 * @example Remove old tool messages
 * ```ts
 * remove((msg, { age }) => msg.role === 'tool' && age > 5)
 * ```
 */
export function remove(
  predicate: (message: LanguageModelV3Message, context: FilterContext) => boolean,
): Filter {
  return (message, context) => {
    if (predicate(message, context)) {
      return null;
    }
    return message;
  };
}

/**
 * Truncates text content that exceeds a length.
 *
 * @example Truncate long messages
 * ```ts
 * truncate(1000, '... [truncated]')
 * ```
 */
export function truncate(
  maxLength: number,
  suffix: string = '... [truncated]',
): Filter {
  return (message) => {
    if (message.role === 'system') {
      if (message.content.length > maxLength) {
        return {
          ...message,
          content: message.content.slice(0, maxLength - suffix.length) + suffix,
        };
      }
      return message;
    }

    // For array content, truncate text parts
    if (Array.isArray(message.content)) {
      const newContent = message.content.map(part => {
        if (part.type === 'text' && part.text.length > maxLength) {
          return {
            ...part,
            text: part.text.slice(0, maxLength - suffix.length) + suffix,
          };
        }
        return part;
      });
      return { ...message, content: newContent } as LanguageModelV3Message;
    }

    return message;
  };
}

/**
 * Redacts tool results older than a threshold.
 * Keeps the tool call structure but replaces the output.
 *
 * @example
 * ```ts
 * redactOldToolResults(5, '[Result omitted - see original logs]')
 * ```
 */
export function redactOldToolResults(
  ageThreshold: number,
  placeholder: string = '[Tool result omitted for context management]',
): Filter {
  return (message, context) => {
    if (message.role !== 'tool') return message;
    if (context.age <= ageThreshold) return message;

    // Replace tool results with placeholder
    const newContent = message.content.map(part => {
      if (part.type === 'tool-result') {
        return {
          ...part,
          output: { type: 'text' as const, value: placeholder },
        };
      }
      return part;
    });

    return { ...message, content: newContent } as LanguageModelV3Message;
  };
}

/**
 * Keeps only the most recent N messages, removing older ones.
 * System messages are always kept.
 *
 * @example
 * ```ts
 * keepRecent(20)
 * ```
 */
export function keepRecent(count: number): Filter {
  return (message, context) => {
    if (message.role === 'system') return message;
    if (context.age < count) return message;
    return null;
  };
}
