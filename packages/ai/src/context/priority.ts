import { LanguageModelV3Message } from '@ai-sdk/provider';
import { PriorityContext, PriorityFunction } from './types';

/**
 * Default priority: recency-based.
 * Newer messages have higher priority.
 * System messages are pinned.
 */
export const recency: PriorityFunction = (message, { index }) => {
  if (message.role === 'system') return Infinity;
  return index;
};

/**
 * Creates a priority function that assigns scores based on message role.
 *
 * @example
 * ```ts
 * byRole({
 *   system: Infinity,  // Always keep
 *   user: 1000,        // High priority
 *   assistant: 500,    // Medium priority
 *   tool: 100,         // Low priority
 * })
 * ```
 */
export function byRole(
  weights: Partial<Record<LanguageModelV3Message['role'], number>>,
): PriorityFunction {
  const defaultWeight = 500;
  return (message, { index }) => {
    const roleWeight = weights[message.role] ?? defaultWeight;
    // Add index to use recency as tiebreaker
    return roleWeight + index;
  };
}

/**
 * Pins certain messages (they're always kept).
 * Non-pinned messages fall back to recency.
 *
 * @example
 * ```ts
 * pin(msg => msg.role === 'system')
 * ```
 */
export function pin(
  predicate: (message: LanguageModelV3Message) => boolean,
): PriorityFunction {
  return (message, { index }) => {
    if (predicate(message)) return Infinity;
    return index;
  };
}

/**
 * Combines multiple priority functions.
 * Scores are summed together.
 *
 * @example
 * ```ts
 * combine(
 *   pin(msg => msg.role === 'system'),
 *   byRole({ user: 100, tool: -50 }),
 * )
 * ```
 */
export function combine(
  ...fns: PriorityFunction[]
): PriorityFunction {
  return (message, context) => {
    let total = 0;
    for (const fn of fns) {
      const score = fn(message, context);
      if (score === Infinity) return Infinity;
      if (score === -Infinity) return -Infinity;
      total += score;
    }
    return total;
  };
}

/**
 * Always drop messages matching the predicate.
 *
 * @example
 * ```ts
 * drop(msg => msg.role === 'tool')
 * ```
 */
export function drop(
  predicate: (message: LanguageModelV3Message) => boolean,
): PriorityFunction {
  return (message, context) => {
    if (predicate(message)) return -Infinity;
    return 0; // Neutral score, combine with other functions
  };
}

/**
 * Adds bonus priority to messages matching the predicate.
 *
 * @example
 * ```ts
 * boost(msg => msg.role === 'user', 100)
 * ```
 */
export function boost(
  predicate: (message: LanguageModelV3Message) => boolean,
  amount: number,
): PriorityFunction {
  return (message) => {
    if (predicate(message)) return amount;
    return 0;
  };
}
