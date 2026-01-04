import { LanguageModelV3Message } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { Context, createContext } from './context';
import { redactOldToolResults, remove } from './filters';

describe('Context', () => {
  describe('basic operations', () => {
    it('should append messages', () => {
      const context = createContext();
      context.append({ role: 'system', content: 'You are helpful.' });
      context.append({ role: 'user', content: [{ type: 'text', text: 'Hello' }] });

      expect(context.length).toBe(2);
      expect(context.messages).toHaveLength(2);
    });

    it('should append multiple messages', () => {
      const context = createContext();
      context.appendAll([
        { role: 'system', content: 'System' },
        { role: 'user', content: [{ type: 'text', text: 'User' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Assistant' }] },
      ]);

      expect(context.length).toBe(3);
    });

    it('should clear messages', () => {
      const context = createContext();
      context.append({ role: 'user', content: [{ type: 'text', text: 'Hello' }] });
      context.clear();

      expect(context.length).toBe(0);
      expect(context.segments).toHaveLength(0);
    });
  });

  describe('buildPrompt', () => {
    it('should return all messages when no filters', async () => {
      const context = createContext();
      context.appendAll([
        { role: 'system', content: 'System' },
        { role: 'user', content: [{ type: 'text', text: 'User' }] },
      ]);

      const prompt = await context.buildPrompt();
      expect(prompt).toHaveLength(2);
    });

    it('should apply filters', async () => {
      const context = createContext({
        filters: [
          remove((msg) => msg.role === 'tool'),
        ],
      });

      context.appendAll([
        { role: 'system', content: 'System' },
        { role: 'user', content: [{ type: 'text', text: 'User' }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'test', output: { type: 'text', value: 'result' } }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Assistant' }] },
      ]);

      const prompt = await context.buildPrompt();
      expect(prompt).toHaveLength(3);
      expect(prompt.every(m => m.role !== 'tool')).toBe(true);
    });

    it('should apply additional filters', async () => {
      const context = createContext();

      context.appendAll([
        { role: 'user', content: [{ type: 'text', text: 'Keep' }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'test', output: { type: 'text', value: 'result' } }] },
      ]);

      const prompt = await context.buildPrompt({
        filters: [remove(msg => msg.role === 'tool')],
      });

      expect(prompt).toHaveLength(1);
    });
  });

  describe('compaction', () => {
    it('should compact messages with a compactor', async () => {
      const mockCompactor = vi.fn().mockResolvedValue({
        role: 'system' as const,
        content: '[Summary of conversation]',
      });

      const context = createContext({
        compactor: mockCompactor,
        keepRecent: 2,
      });

      // Add enough messages
      for (let i = 0; i < 10; i++) {
        context.append({
          role: 'user',
          content: [{ type: 'text', text: `Message ${i}` }],
        });
      }

      const segment = await context.compact({ force: true });

      expect(segment).not.toBeNull();
      expect(segment?.range).toEqual([0, 8]); // Keep last 2
      expect(mockCompactor).toHaveBeenCalledOnce();
      expect(context.segments).toHaveLength(1);
    });

    it('should call onCompact callback', async () => {
      const onCompact = vi.fn();
      const context = createContext({
        compactor: async () => ({ role: 'system', content: 'Summary' }),
        keepRecent: 2,
        onCompact,
      });

      for (let i = 0; i < 10; i++) {
        context.append({
          role: 'user',
          content: [{ type: 'text', text: `Message ${i}` }],
        });
      }

      await context.compact({ force: true });

      expect(onCompact).toHaveBeenCalledOnce();
      expect(onCompact).toHaveBeenCalledWith(
        expect.objectContaining({
          range: [0, 8],
        }),
      );
    });

    it('should use segments in buildPrompt', async () => {
      const context = createContext({
        compactor: async () => ({
          role: 'system',
          content: '[Previous conversation summary]',
        }),
        keepRecent: 2,
      });

      for (let i = 0; i < 10; i++) {
        context.append({
          role: 'user',
          content: [{ type: 'text', text: `Message ${i}` }],
        });
      }

      await context.compact({ force: true });

      const prompt = await context.buildPrompt();

      // Should have: 1 segment + 2 recent messages
      expect(prompt).toHaveLength(3);
      expect(prompt[0].role).toBe('system');
      expect((prompt[0] as any).content).toContain('summary');
    });

    it('should throw if no compactor configured', async () => {
      const context = createContext();
      await expect(context.compact()).rejects.toThrow('No compactor configured');
    });
  });

  describe('auto-compaction', () => {
    it('should check shouldCompact based on message count', async () => {
      const context = createContext({
        trigger: { messages: 5 },
      });

      for (let i = 0; i < 3; i++) {
        context.append({
          role: 'user',
          content: [{ type: 'text', text: `Message ${i}` }],
        });
      }

      expect(await context.shouldCompact()).toBe(false);

      for (let i = 0; i < 5; i++) {
        context.append({
          role: 'user',
          content: [{ type: 'text', text: `Message ${i}` }],
        });
      }

      expect(await context.shouldCompact()).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should export and restore from snapshot', () => {
      const original = createContext();
      original.appendAll([
        { role: 'system', content: 'System' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ]);

      const snapshot = original.toSnapshot();

      expect(snapshot.version).toBe(1);
      expect(snapshot.messages).toHaveLength(2);
      expect(snapshot.segments).toHaveLength(0);

      const restored = Context.fromSnapshot(snapshot);
      expect(restored.length).toBe(2);
      expect(restored.messages[0]).toEqual(original.messages[0]);
    });

    it('should restore segments from snapshot', async () => {
      const original = createContext({
        compactor: async () => ({ role: 'system', content: 'Summary' }),
        keepRecent: 2,
      });

      for (let i = 0; i < 10; i++) {
        original.append({
          role: 'user',
          content: [{ type: 'text', text: `Message ${i}` }],
        });
      }

      await original.compact({ force: true });

      const snapshot = original.toSnapshot();
      const restored = Context.fromSnapshot(snapshot);

      expect(restored.segments).toHaveLength(1);
      expect(restored.segments[0].range).toEqual([0, 8]);
    });
  });
});

describe('filters', () => {
  it('redactOldToolResults should redact old tool results', async () => {
    const context = createContext({
      filters: [redactOldToolResults(2)],
    });

    context.appendAll([
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'old', output: { type: 'text', value: 'old result' } }] },
      { role: 'user', content: [{ type: 'text', text: 'Middle' }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: '2', toolName: 'recent', output: { type: 'text', value: 'recent result' } }] },
      { role: 'user', content: [{ type: 'text', text: 'Latest' }] },
    ]);

    const prompt = await context.buildPrompt();

    // Old tool result should be redacted
    const oldTool = prompt.find(m => 
      m.role === 'tool' && 
      Array.isArray(m.content) && 
      m.content.some(p => p.type === 'tool-result' && p.toolName === 'old')
    );
    
    if (oldTool && Array.isArray(oldTool.content)) {
      const part = oldTool.content.find(p => p.type === 'tool-result') as any;
      expect(part.output.value).toContain('omitted');
    }

    // Recent tool result should be intact
    const recentTool = prompt.find(m => 
      m.role === 'tool' && 
      Array.isArray(m.content) && 
      m.content.some(p => p.type === 'tool-result' && p.toolName === 'recent')
    );
    
    if (recentTool && Array.isArray(recentTool.content)) {
      const part = recentTool.content.find(p => p.type === 'tool-result') as any;
      expect(part.output.value).toBe('recent result');
    }
  });
});
