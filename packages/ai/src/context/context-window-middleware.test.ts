import { LanguageModelV3 } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import {
  contextWindow,
  forModel,
  modelContextLimits,
} from './context-window-middleware';

// Mock model for testing
const mockModel: LanguageModelV3 = {
  specificationVersion: 'v3',
  provider: 'test',
  modelId: 'test-model',
  supportedUrls: {},
  doGenerate: vi.fn(),
  doStream: vi.fn(),
};

describe('contextWindow middleware', () => {
  it('should have v3 specification version', () => {
    const middleware = contextWindow({ maxTokens: 1000 });
    expect(middleware.specificationVersion).toBe('v3');
  });

  it('should transform params with context selection', async () => {
    const middleware = contextWindow({
      maxTokens: 200,
      estimateTokens: () => 100,
    });

    const params = {
      prompt: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Old' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Middle' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'New' }] },
      ],
      maxOutputTokens: 100,
    };

    const result = await middleware.transformParams!({
      params,
      type: 'generate',
      model: mockModel,
    });

    expect(result.prompt).toHaveLength(2);
  });

  it('should call onDrop when messages are dropped', async () => {
    const onDrop = vi.fn();
    const middleware = contextWindow({
      maxTokens: 100,
      estimateTokens: () => 100,
      onDrop,
    });

    const params = {
      prompt: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Old' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'New' }] },
      ],
      maxOutputTokens: 100,
    };

    await middleware.transformParams!({
      params,
      type: 'generate',
      model: mockModel,
    });

    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 1,
        tokens: 100,
      }),
    );
  });

  it('should not call onDrop when no messages are dropped', async () => {
    const onDrop = vi.fn();
    const middleware = contextWindow({
      maxTokens: 1000,
      estimateTokens: () => 100,
      onDrop,
    });

    const params = {
      prompt: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Keep' }] },
      ],
      maxOutputTokens: 100,
    };

    await middleware.transformParams!({
      params,
      type: 'generate',
      model: mockModel,
    });

    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe('forModel', () => {
  it('should create middleware with model-specific limits', () => {
    const middleware = forModel('gpt-4o');
    expect(middleware.specificationVersion).toBe('v3');
  });

  it('should accept custom options', async () => {
    const onDrop = vi.fn();
    const middleware = forModel('gpt-4o', {
      onDrop,
      estimateTokens: () => 100000, // Large messages
    });

    const params = {
      prompt: [
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Message 1' }] },
        { role: 'user' as const, content: [{ type: 'text' as const, text: 'Message 2' }] },
      ],
      maxOutputTokens: 100,
    };

    await middleware.transformParams!({
      params,
      type: 'generate',
      model: mockModel,
    });

    expect(onDrop).toHaveBeenCalled();
  });
});

describe('modelContextLimits', () => {
  it('should have common models', () => {
    expect(modelContextLimits['gpt-4o']).toBe(128000);
    expect(modelContextLimits['claude-3-5-sonnet']).toBe(200000);
    expect(modelContextLimits['gemini-1.5-pro']).toBe(2000000);
  });
});
