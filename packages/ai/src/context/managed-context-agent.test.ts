import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ManagedContextAgent, createManagedAgent } from './managed-context-agent';
import { LanguageModelV3 } from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Create a mock language model
function createMockModel(): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: Promise.resolve({}),
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Test response' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 100 },
        outputTokens: { total: 50 },
      },
    }),
    doStream: vi.fn().mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'text-start',
            id: '1',
          });
          controller.enqueue({
            type: 'text-delta',
            id: '1',
            delta: 'Test',
          });
          controller.enqueue({
            type: 'text-end',
            id: '1',
          });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 100 },
              outputTokens: { total: 50 },
            },
          });
          controller.close();
        },
      }),
    }),
  } as LanguageModelV3;
}

describe('ManagedContextAgent', () => {
  let mockModel: LanguageModelV3;

  beforeEach(() => {
    mockModel = createMockModel();
  });

  describe('creation', () => {
    it('should create an agent with preset', () => {
      const agent = new ManagedContextAgent({
        model: mockModel,
        context: { preset: 'gpt-4o' },
        instructions: 'You are helpful.',
      });

      expect(agent.version).toBe('agent-v1');
      expect(agent.model).toBeDefined();
    });

    it('should create an agent with maxPromptTokens', () => {
      const agent = new ManagedContextAgent({
        model: mockModel,
        context: { maxPromptTokens: 50000 },
        instructions: 'You are helpful.',
      });

      expect(agent.version).toBe('agent-v1');
    });

    it('should throw if neither preset nor maxPromptTokens provided', () => {
      expect(() => {
        new ManagedContextAgent({
          model: mockModel,
          context: {},
          instructions: 'You are helpful.',
        });
      }).toThrow('requires either context.preset or context.maxPromptTokens');
    });

    it('should set agent id', () => {
      const agent = new ManagedContextAgent({
        id: 'my-agent',
        model: mockModel,
        context: { preset: 'gpt-4o' },
        instructions: 'You are helpful.',
      });

      expect(agent.id).toBe('my-agent');
    });

    it('should set agent tools', () => {
      const weatherTool = tool({
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
        execute: async () => ({ temp: 72 }),
      });

      const agent = new ManagedContextAgent({
        model: mockModel,
        context: { preset: 'gpt-4o' },
        instructions: 'You are helpful.',
        tools: { weather: weatherTool },
      });

      expect(agent.tools).toHaveProperty('weather');
    });
  });

  describe('context configuration', () => {
    it('should use preset token limits', () => {
      const onPrune = vi.fn();

      const agent = new ManagedContextAgent({
        model: mockModel,
        context: {
          preset: 'gpt-4o',
          onPrune,
        },
        instructions: 'You are helpful.',
      });

      // Agent created successfully with preset
      expect(agent).toBeDefined();
    });

    it('should use custom strategy', () => {
      const agent = new ManagedContextAgent({
        model: mockModel,
        context: {
          maxPromptTokens: 50000,
          strategy: 'priority-based',
        },
        instructions: 'You are helpful.',
      });

      expect(agent).toBeDefined();
    });

    it('should use custom priority assignment', () => {
      const assignPriority = vi.fn().mockReturnValue('normal');

      const agent = new ManagedContextAgent({
        model: mockModel,
        context: {
          maxPromptTokens: 50000,
          assignPriority,
        },
        instructions: 'You are helpful.',
      });

      expect(agent).toBeDefined();
    });

    it('should use custom token estimator', () => {
      const estimateTokens = vi.fn().mockReturnValue(100);

      const agent = new ManagedContextAgent({
        model: mockModel,
        context: {
          maxPromptTokens: 50000,
          estimateTokens,
        },
        instructions: 'You are helpful.',
      });

      expect(agent).toBeDefined();
    });
  });

  describe('generate', () => {
    it('should generate a response', async () => {
      const agent = new ManagedContextAgent({
        model: mockModel,
        context: { preset: 'gpt-4o' },
        instructions: 'You are helpful.',
      });

      const result = await agent.generate({
        prompt: 'Hello!',
      });

      expect(result).toBeDefined();
      expect(result.text).toBe('Test response');
    });

    it('should handle long message history', async () => {
      const agent = new ManagedContextAgent({
        model: mockModel,
        context: {
          maxPromptTokens: 500,
          estimateTokens: () => 100, // Each message = 100 tokens
        },
        instructions: 'You are helpful.',
      });

      // Create a long message history
      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push({
          role: 'user' as const,
          content: `Message ${i}`,
        });
        messages.push({
          role: 'assistant' as const,
          content: `Response ${i}`,
        });
      }

      const result = await agent.generate({
        messages,
      });

      expect(result).toBeDefined();
      // The mock model should have been called with a pruned prompt
    });
  });

  describe('stream', () => {
    it('should stream a response', async () => {
      const agent = new ManagedContextAgent({
        model: mockModel,
        context: { preset: 'gpt-4o' },
        instructions: 'You are helpful.',
      });

      const result = await agent.stream({
        prompt: 'Hello!',
      });

      expect(result).toBeDefined();
      expect(result.textStream).toBeDefined();
    });
  });
});

describe('createManagedAgent', () => {
  it('should create a ManagedContextAgent', () => {
    const mockModel = createMockModel();

    const agent = createManagedAgent({
      model: mockModel,
      context: { preset: 'gpt-4o' },
      instructions: 'You are helpful.',
    });

    expect(agent).toBeInstanceOf(ManagedContextAgent);
    expect(agent.version).toBe('agent-v1');
  });
});
