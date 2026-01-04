import { describe, expect, it } from 'vitest';
import {
  createCharacterBasedEstimator,
  defaultTokenEstimator,
  estimatePromptTokens,
  estimateTextTokens,
} from './estimate-tokens';
import { LanguageModelV3Message } from '@ai-sdk/provider';

describe('estimateTextTokens', () => {
  it('should estimate tokens for a simple string', () => {
    // 14 chars / 3.5 = 4 tokens
    const result = estimateTextTokens('Hello, world!');
    expect(result).toBe(4);
  });

  it('should use custom chars per token', () => {
    // 14 chars / 4 = 3.5, rounded up = 4
    const result = estimateTextTokens('Hello, world!', 4);
    expect(result).toBe(4);
  });

  it('should handle empty string', () => {
    const result = estimateTextTokens('');
    expect(result).toBe(0);
  });

  it('should handle long text', () => {
    const longText = 'a'.repeat(1000);
    // 1000 / 3.5 ≈ 286
    const result = estimateTextTokens(longText);
    expect(result).toBe(286);
  });
});

describe('defaultTokenEstimator', () => {
  it('should estimate tokens for a system message', () => {
    const message: LanguageModelV3Message = {
      role: 'system',
      content: 'You are a helpful assistant.',
    };

    const result = defaultTokenEstimator(message);
    // "system You are a helpful assistant." = 37 chars
    // 37 / 3.5 ≈ 11 + 4 overhead = 15
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(20);
  });

  it('should estimate tokens for a user message with text', () => {
    const message: LanguageModelV3Message = {
      role: 'user',
      content: [{ type: 'text', text: 'Hello!' }],
    };

    const result = defaultTokenEstimator(message);
    // Should include overhead + text
    expect(result).toBeGreaterThan(5);
    expect(result).toBeLessThan(15);
  });

  it('should estimate tokens for an assistant message with tool call', () => {
    const message: LanguageModelV3Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check the weather.' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'getWeather',
          input: { city: 'Tokyo' },
        },
      ],
    };

    const result = defaultTokenEstimator(message);
    // Should include text + tool name + JSON input
    expect(result).toBeGreaterThan(15);
    expect(result).toBeLessThan(40);
  });

  it('should estimate tokens for a tool message', () => {
    const message: LanguageModelV3Message = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'getWeather',
          output: { type: 'json', value: { temperature: 25, unit: 'celsius' } },
        },
      ],
    };

    const result = defaultTokenEstimator(message);
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(30);
  });
});

describe('estimatePromptTokens', () => {
  it('should sum tokens for all messages', async () => {
    const messages: LanguageModelV3Message[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: [{ type: 'text', text: 'Hi!' }] },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
      },
    ];

    const result = await estimatePromptTokens(messages);
    // Should be sum of individual estimates
    expect(result).toBeGreaterThan(20);
    expect(result).toBeLessThan(50);
  });

  it('should use custom estimator', async () => {
    const messages: LanguageModelV3Message[] = [
      { role: 'system', content: 'Test' },
    ];

    const customEstimator = () => 100;
    const result = await estimatePromptTokens(messages, customEstimator);
    expect(result).toBe(100);
  });

  it('should handle empty messages array', async () => {
    const result = await estimatePromptTokens([]);
    expect(result).toBe(0);
  });
});

describe('createCharacterBasedEstimator', () => {
  it('should create estimator with custom ratio', async () => {
    const estimator = createCharacterBasedEstimator(5);

    const message: LanguageModelV3Message = {
      role: 'system',
      content: 'Test message here',
    };

    // Different ratio should give different result
    const defaultResult = await defaultTokenEstimator(message);
    const customResult = await estimator(message);

    expect(customResult).not.toBe(defaultResult);
  });

  it('should produce lower token counts with higher chars/token ratio', async () => {
    const estimatorLow = createCharacterBasedEstimator(3);
    const estimatorHigh = createCharacterBasedEstimator(5);

    const message: LanguageModelV3Message = {
      role: 'system',
      content: 'A relatively long message for testing purposes.',
    };

    const lowResult = await estimatorLow(message);
    const highResult = await estimatorHigh(message);

    expect(lowResult).toBeGreaterThan(highResult);
  });
});
