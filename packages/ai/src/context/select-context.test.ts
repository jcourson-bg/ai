import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { byRole, pin } from './priority';
import { selectContext } from './select-context';

// Fixed token estimator for predictable tests
const fixedEstimator = () => 100;

describe('selectContext', () => {
  describe('basic selection', () => {
    it('should keep all messages when within budget', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 1000,
        estimateTokens: fixedEstimator,
      });

      expect(result.messages).toHaveLength(3);
      expect(result.dropped).toBeUndefined();
    });

    it('should drop low-priority messages when over budget', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'system', content: 'System' },
        { role: 'user', content: [{ type: 'text', text: 'Old message' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Old reply' }] },
        { role: 'user', content: [{ type: 'text', text: 'New message' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'New reply' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 300, // Only fits 3 messages
        estimateTokens: fixedEstimator,
      });

      // Should keep system (pinned) and 2 newest messages
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[2].role).toBe('assistant');

      expect(result.dropped?.count).toBe(2);
    });

    it('should preserve message order in result', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'system', content: 'System' },
        { role: 'user', content: [{ type: 'text', text: 'First' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Second' }] },
        { role: 'user', content: [{ type: 'text', text: 'Third' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 400,
        estimateTokens: fixedEstimator,
      });

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[2].role).toBe('assistant');
      expect(result.messages[3].role).toBe('user');
    });
  });

  describe('priority function', () => {
    it('should use custom priority function', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'Low priority' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'High priority' }] },
        { role: 'user', content: [{ type: 'text', text: 'Low priority' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 200, // Only 2 messages
        estimateTokens: fixedEstimator,
        // Prioritize assistant messages
        priority: (msg, { index }) => {
          if (msg.role === 'assistant') return 1000 + index;
          return index;
        },
      });

      expect(result.messages).toHaveLength(2);
      // Assistant should be kept despite being in the middle
      expect(result.messages.some(m => m.role === 'assistant')).toBe(true);
    });

    it('should pin messages with Infinity priority', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'system', content: 'Always keep me' },
        { role: 'user', content: [{ type: 'text', text: 'Maybe drop' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Maybe drop' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 200,
        estimateTokens: fixedEstimator,
        priority: pin(m => m.role === 'system'),
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
    });

    it('should always drop messages with -Infinity priority', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'system', content: 'Keep' },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'test', output: { type: 'text', value: 'result' } }] },
        { role: 'user', content: [{ type: 'text', text: 'Keep' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 1000, // Plenty of room
        estimateTokens: fixedEstimator,
        priority: (msg) => (msg.role === 'tool' ? -Infinity : 0),
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages.every(m => m.role !== 'tool')).toBe(true);
      expect(result.dropped?.count).toBe(1);
    });
  });

  describe('byRole helper', () => {
    it('should prioritize by role weights', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'test', output: { type: 'text', value: 'result' } }] },
        { role: 'user', content: [{ type: 'text', text: 'Important' }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: '2', toolName: 'test', output: { type: 'text', value: 'result' } }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Medium' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 200, // Only 2 messages
        estimateTokens: fixedEstimator,
        priority: byRole({
          user: 1000,
          assistant: 500,
          tool: 100,
        }),
      });

      expect(result.messages).toHaveLength(2);
      // Should keep user (highest priority) and assistant (second highest)
      const roles = result.messages.map(m => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    });
  });

  describe('dropped info', () => {
    it('should provide accurate drop info', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'Message 1' }] },
        { role: 'user', content: [{ type: 'text', text: 'Message 2' }] },
        { role: 'user', content: [{ type: 'text', text: 'Message 3' }] },
        { role: 'user', content: [{ type: 'text', text: 'Message 4' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 200, // Only 2 messages
        estimateTokens: fixedEstimator,
      });

      expect(result.dropped).toBeDefined();
      expect(result.dropped?.count).toBe(2);
      expect(result.dropped?.tokens).toBe(200);
      expect(result.dropped?.messages).toHaveLength(2);
    });

    it('should include dropped messages in original order', async () => {
      const prompt: LanguageModelV3Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'First - drop' }] },
        { role: 'user', content: [{ type: 'text', text: 'Second - drop' }] },
        { role: 'user', content: [{ type: 'text', text: 'Third - keep' }] },
        { role: 'user', content: [{ type: 'text', text: 'Fourth - keep' }] },
      ];

      const result = await selectContext(prompt, {
        maxTokens: 200,
        estimateTokens: fixedEstimator,
      });

      expect(result.dropped?.messages).toHaveLength(2);
      // Dropped messages should be the older ones
      expect((result.dropped?.messages[0].content as any)[0].text).toBe('First - drop');
      expect((result.dropped?.messages[1].content as any)[0].text).toBe('Second - drop');
    });
  });
});
