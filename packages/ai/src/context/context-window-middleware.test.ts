import { describe, expect, it, vi } from 'vitest';
import {
  contextWindow,
  contextWindowForModel,
  contextWindowPresets,
} from './context-window-middleware';
import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Message,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from '../middleware/wrap-language-model';

// Fixed token estimator for predictable tests
const fixedEstimator = () => 100;

// Create a mock language model
function createMockModel(): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: Promise.resolve({}),
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Response' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 100 },
        outputTokens: { total: 50 },
      },
    }),
    doStream: vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
    }),
  } as LanguageModelV3;
}

function createTestPrompt(count: number): LanguageModelV3Message[] {
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

describe('contextWindow middleware', () => {
  it('should prune messages to fit within token limit', async () => {
    const mockModel = createMockModel();
    const middleware = contextWindow({
      maxPromptTokens: 300,
      estimateTokens: fixedEstimator,
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    const prompt = createTestPrompt(10);

    await wrappedModel.doGenerate({
      prompt,
    });

    // Verify the model was called with a pruned prompt
    expect(mockModel.doGenerate).toHaveBeenCalledTimes(1);
    const callArgs = (mockModel.doGenerate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as LanguageModelV3CallOptions;

    // Should have fewer messages than original
    expect(callArgs.prompt.length).toBeLessThan(prompt.length);
    expect(callArgs.prompt.length).toBeLessThanOrEqual(3);
  });

  it('should pass through all messages when under limit', async () => {
    const mockModel = createMockModel();
    const middleware = contextWindow({
      maxPromptTokens: 10000,
      estimateTokens: fixedEstimator,
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    const prompt = createTestPrompt(5);

    await wrappedModel.doGenerate({
      prompt,
    });

    const callArgs = (mockModel.doGenerate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as LanguageModelV3CallOptions;

    // Should have all messages
    expect(callArgs.prompt.length).toBe(5);
  });

  it('should call onPrune when messages are removed', async () => {
    const onPrune = vi.fn();
    const mockModel = createMockModel();
    const middleware = contextWindow({
      maxPromptTokens: 300,
      estimateTokens: fixedEstimator,
      onPrune,
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    const prompt = createTestPrompt(10);

    await wrappedModel.doGenerate({
      prompt,
    });

    expect(onPrune).toHaveBeenCalledTimes(1);
    expect(onPrune).toHaveBeenCalledWith(
      expect.objectContaining({
        removedCount: expect.any(Number),
        totalTokens: expect.any(Number),
      }),
    );
  });

  it('should work with streaming', async () => {
    const mockModel = createMockModel();
    const middleware = contextWindow({
      maxPromptTokens: 300,
      estimateTokens: fixedEstimator,
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    const prompt = createTestPrompt(10);

    await wrappedModel.doStream({
      prompt,
    });

    expect(mockModel.doStream).toHaveBeenCalledTimes(1);
    const callArgs = (mockModel.doStream as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as LanguageModelV3CallOptions;

    // Should have pruned messages
    expect(callArgs.prompt.length).toBeLessThan(prompt.length);
  });

  it('should preserve non-prompt parameters', async () => {
    const mockModel = createMockModel();
    const middleware = contextWindow({
      maxPromptTokens: 300,
      estimateTokens: fixedEstimator,
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    await wrappedModel.doGenerate({
      prompt: createTestPrompt(10),
      maxOutputTokens: 500,
      temperature: 0.7,
    });

    const callArgs = (mockModel.doGenerate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as LanguageModelV3CallOptions;

    // Non-prompt params should be preserved
    expect(callArgs.maxOutputTokens).toBe(500);
    expect(callArgs.temperature).toBe(0.7);
  });

  it('should use the specified strategy', async () => {
    const mockModel = createMockModel();
    const middleware = contextWindow({
      maxPromptTokens: 400,
      estimateTokens: fixedEstimator,
      strategy: 'priority-based',
      assignPriority: message => {
        if (message.role === 'system') return 'critical';
        if (message.role === 'user') return 'high';
        return 'low';
      },
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    const prompt: LanguageModelV3Message[] = [
      { role: 'system', content: 'System' },
      { role: 'user', content: [{ type: 'text', text: 'User 1' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Low priority' }] },
      { role: 'user', content: [{ type: 'text', text: 'User 2' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Low priority' }] },
      { role: 'user', content: [{ type: 'text', text: 'User 3' }] },
    ];

    await wrappedModel.doGenerate({
      prompt,
    });

    const callArgs = (mockModel.doGenerate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as LanguageModelV3CallOptions;

    // User messages (high priority) should be kept over assistant messages (low priority)
    const userCount = callArgs.prompt.filter(m => m.role === 'user').length;
    const assistantCount = callArgs.prompt.filter(
      m => m.role === 'assistant',
    ).length;

    expect(userCount).toBeGreaterThanOrEqual(assistantCount);
  });
});

describe('contextWindowPresets', () => {
  it('should have correct limits for gpt-4o', () => {
    expect(contextWindowPresets['gpt-4o'].maxPromptTokens).toBe(100000);
  });

  it('should have correct limits for claude-3-5-sonnet', () => {
    expect(contextWindowPresets['claude-3-5-sonnet'].maxPromptTokens).toBe(
      192000,
    );
  });

  it('should have correct limits for gemini-1-5-pro', () => {
    expect(contextWindowPresets['gemini-1-5-pro'].maxPromptTokens).toBe(
      2000000,
    );
  });
});

describe('contextWindowForModel', () => {
  it('should create middleware with preset config', async () => {
    const mockModel = createMockModel();
    const middleware = contextWindowForModel('gpt-4o');

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    // Just verify it creates valid middleware
    expect(wrappedModel.specificationVersion).toBe('v3');
    expect(wrappedModel.provider).toBe('test');
  });

  it('should allow overriding preset values', async () => {
    const onPrune = vi.fn();
    const mockModel = createMockModel();
    const middleware = contextWindowForModel('gpt-4o', {
      onPrune,
      estimateTokens: fixedEstimator,
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware,
    });

    // Create prompt that would exceed even the override
    const largePrompt = createTestPrompt(2000);

    await wrappedModel.doGenerate({
      prompt: largePrompt,
    });

    // onPrune should have been called
    expect(onPrune).toHaveBeenCalled();
  });
});
