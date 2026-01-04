import { describe, expect, it, vi } from 'vitest';
import { pruneContext } from './prune-context';
import { LanguageModelV3Message } from '@ai-sdk/provider';
import { ContextWindowConfig, MessagePriority } from './types';

// Fixed token estimator for predictable tests
const fixedEstimator = () => 100;

// Create test messages
function createTestMessages(count: number): LanguageModelV3Message[] {
  const messages: LanguageModelV3Message[] = [
    { role: 'system', content: 'You are helpful.' },
  ];

  for (let i = 0; i < count - 1; i++) {
    if (i % 2 === 0) {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: `User message ${i}` }],
      });
    } else {
      messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: `Assistant message ${i}` }],
      });
    }
  }

  return messages;
}

describe('pruneContext', () => {
  describe('when within limits', () => {
    it('should return all messages when total is under limit', async () => {
      const messages = createTestMessages(5);

      const result = await pruneContext(messages, {
        maxPromptTokens: 1000, // 5 messages * 100 = 500 tokens
        estimateTokens: fixedEstimator,
      });

      expect(result.messages).toHaveLength(5);
      expect(result.removedCount).toBe(0);
      expect(result.removedIndices).toEqual([]);
      expect(result.totalTokens).toBe(500);
    });
  });

  describe('sliding-window strategy', () => {
    it('should keep system message and recent messages', async () => {
      const messages = createTestMessages(10);

      const result = await pruneContext(messages, {
        maxPromptTokens: 500, // Can fit 5 messages
        strategy: 'sliding-window',
        estimateTokens: fixedEstimator,
        keepRecentMessages: 2,
      });

      // Should keep: system (1) + recent (2) = 3 pinned
      // Plus 2 more from the remaining to reach 500 tokens
      expect(result.messages.length).toBeLessThanOrEqual(5);
      expect(result.messages[0].role).toBe('system');

      // Last 2 should be the recent ones
      const lastTwo = result.messages.slice(-2);
      expect(lastTwo[0]).toBe(messages[8]);
      expect(lastTwo[1]).toBe(messages[9]);
    });

    it('should use sliding-window as default strategy', async () => {
      const messages = createTestMessages(10);

      const result = await pruneContext(messages, {
        maxPromptTokens: 300,
        estimateTokens: fixedEstimator,
        keepRecentMessages: 2,
      });

      // First message should be system
      expect(result.messages[0].role).toBe('system');

      // Should have kept recent messages
      expect(result.removedCount).toBeGreaterThan(0);
    });
  });

  describe('keep-boundaries strategy', () => {
    it('should keep system message and last few messages', async () => {
      const messages = createTestMessages(10);

      const result = await pruneContext(messages, {
        maxPromptTokens: 500,
        strategy: 'keep-boundaries',
        estimateTokens: fixedEstimator,
      });

      // Should keep system message
      expect(result.messages[0].role).toBe('system');

      // Should have pruned some middle messages
      expect(result.messages.length).toBeLessThanOrEqual(5);
    });
  });

  describe('priority-based strategy', () => {
    it('should keep high priority messages', async () => {
      const messages = createTestMessages(10);

      const assignPriority = (
        message: LanguageModelV3Message,
        index: number,
      ): MessagePriority => {
        // Make message at index 3 high priority
        if (index === 3) return 'high';
        if (message.role === 'system') return 'critical';
        return 'normal';
      };

      const result = await pruneContext(messages, {
        maxPromptTokens: 400,
        strategy: 'priority-based',
        estimateTokens: fixedEstimator,
        assignPriority,
      });

      // Should keep message at index 3
      const keptIndices = result.messages.map(m => messages.indexOf(m));
      expect(keptIndices).toContain(0); // system
      expect(keptIndices).toContain(3); // high priority
    });

    it('should remove low priority messages first', async () => {
      const messages: LanguageModelV3Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: [{ type: 'text', text: 'User 1' }] },
        { role: 'tool', content: [] }, // Tool messages default to low priority
        { role: 'user', content: [{ type: 'text', text: 'User 2' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Final' }] },
      ];

      const result = await pruneContext(messages, {
        maxPromptTokens: 300, // Can fit 3 messages
        strategy: 'priority-based',
        estimateTokens: fixedEstimator,
        keepRecentMessages: 1,
      });

      // Tool message (low priority) should be removed
      const hasToolMessage = result.messages.some(m => m.role === 'tool');
      expect(hasToolMessage).toBe(false);
    });
  });

  describe('result tracking', () => {
    it('should return correct removedCount when messages are removed', async () => {
      const messages = createTestMessages(10);

      const result = await pruneContext(messages, {
        maxPromptTokens: 300,
        estimateTokens: fixedEstimator,
      });

      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.removedIndices.length).toBe(result.removedCount);
      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.totalTokens).toBeLessThanOrEqual(300);
    });

    it('should return zero removedCount when no messages are removed', async () => {
      const messages = createTestMessages(3);

      const result = await pruneContext(messages, {
        maxPromptTokens: 1000,
        estimateTokens: fixedEstimator,
      });

      expect(result.removedCount).toBe(0);
      expect(result.removedIndices).toEqual([]);
      expect(result.messages.length).toBe(messages.length);
    });
  });

  describe('message order preservation', () => {
    it('should maintain original message order after pruning', async () => {
      const messages = createTestMessages(10);

      const result = await pruneContext(messages, {
        maxPromptTokens: 500,
        strategy: 'priority-based',
        estimateTokens: fixedEstimator,
      });

      // Check that messages are in ascending order by original index
      for (let i = 1; i < result.messages.length; i++) {
        const prevOrigIndex = messages.indexOf(result.messages[i - 1]);
        const currOrigIndex = messages.indexOf(result.messages[i]);
        expect(currOrigIndex).toBeGreaterThan(prevOrigIndex);
      }
    });
  });

  describe('pinned messages', () => {
    it('should always keep system messages', async () => {
      const messages: LanguageModelV3Message[] = [
        { role: 'system', content: 'System message 1' },
        { role: 'user', content: [{ type: 'text', text: 'User' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Assistant' }] },
      ];

      const result = await pruneContext(messages, {
        maxPromptTokens: 150, // Can only fit ~1.5 messages
        estimateTokens: fixedEstimator,
        keepRecentMessages: 0,
      });

      // System message should always be kept
      expect(result.messages[0].role).toBe('system');
    });

    it('should always keep keepRecentMessages count', async () => {
      const messages = createTestMessages(10);

      const result = await pruneContext(messages, {
        maxPromptTokens: 400,
        estimateTokens: fixedEstimator,
        keepRecentMessages: 3,
      });

      // Last 3 should be from original last 3
      const lastThreeOriginal = messages.slice(-3);
      const lastThreeResult = result.messages.slice(-3);

      expect(lastThreeResult).toEqual(lastThreeOriginal);
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', async () => {
      const result = await pruneContext([], {
        maxPromptTokens: 1000,
        estimateTokens: fixedEstimator,
      });

      expect(result.messages).toEqual([]);
      expect(result.removedCount).toBe(0);
    });

    it('should handle single message', async () => {
      const messages: LanguageModelV3Message[] = [
        { role: 'system', content: 'Only message' },
      ];

      const result = await pruneContext(messages, {
        maxPromptTokens: 50, // Less than one message
        estimateTokens: fixedEstimator,
      });

      // System message should still be kept (pinned)
      expect(result.messages).toHaveLength(1);
    });

    it('should handle async estimator', async () => {
      const asyncEstimator = async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return 100;
      };

      const messages = createTestMessages(5);

      const result = await pruneContext(messages, {
        maxPromptTokens: 300,
        estimateTokens: asyncEstimator,
      });

      expect(result.messages.length).toBeLessThanOrEqual(3);
    });
  });
});
