import { describe, expect, it } from 'vitest';
import {
  boost,
  byRole,
  combine,
  drop,
  pin,
  recency,
} from './priority';

const createContext = (index: number, total: number = 10, tokens: number = 100) => ({
  index,
  total,
  tokens,
});

describe('recency', () => {
  it('should return Infinity for system messages', () => {
    const message = { role: 'system' as const, content: 'test' };
    expect(recency(message, createContext(0))).toBe(Infinity);
  });

  it('should return index for non-system messages', () => {
    const message = { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] };
    expect(recency(message, createContext(5))).toBe(5);
    expect(recency(message, createContext(0))).toBe(0);
  });
});

describe('byRole', () => {
  it('should assign weights based on role', () => {
    const priority = byRole({
      system: Infinity,
      user: 1000,
      assistant: 500,
      tool: 100,
    });

    const system = { role: 'system' as const, content: 'test' };
    const user = { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] };
    const assistant = { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'test' }] };
    const tool = { role: 'tool' as const, content: [{ type: 'tool-result' as const, toolCallId: '1', toolName: 'test', output: { type: 'text' as const, value: 'result' } }] };

    expect(priority(system, createContext(0))).toBe(Infinity);
    expect(priority(user, createContext(0))).toBe(1000); // 1000 + 0
    expect(priority(user, createContext(5))).toBe(1005); // 1000 + 5
    expect(priority(assistant, createContext(0))).toBe(500);
    expect(priority(tool, createContext(3))).toBe(103); // 100 + 3
  });

  it('should use default weight for unknown roles', () => {
    const priority = byRole({ user: 1000 });
    const assistant = { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'test' }] };

    // Default is 500, plus index
    expect(priority(assistant, createContext(2))).toBe(502);
  });
});

describe('pin', () => {
  it('should return Infinity for matching messages', () => {
    const priority = pin(m => m.role === 'system');
    const system = { role: 'system' as const, content: 'test' };

    expect(priority(system, createContext(0))).toBe(Infinity);
  });

  it('should return index for non-matching messages', () => {
    const priority = pin(m => m.role === 'system');
    const user = { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] };

    expect(priority(user, createContext(5))).toBe(5);
  });
});

describe('drop', () => {
  it('should return -Infinity for matching messages', () => {
    const priority = drop(m => m.role === 'tool');
    const tool = { role: 'tool' as const, content: [{ type: 'tool-result' as const, toolCallId: '1', toolName: 'test', output: { type: 'text' as const, value: 'result' } }] };

    expect(priority(tool, createContext(0))).toBe(-Infinity);
  });

  it('should return 0 for non-matching messages', () => {
    const priority = drop(m => m.role === 'tool');
    const user = { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] };

    expect(priority(user, createContext(0))).toBe(0);
  });
});

describe('boost', () => {
  it('should add bonus to matching messages', () => {
    const priority = boost(m => m.role === 'user', 100);
    const user = { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] };
    const assistant = { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'test' }] };

    expect(priority(user, createContext(0))).toBe(100);
    expect(priority(assistant, createContext(0))).toBe(0);
  });
});

describe('combine', () => {
  it('should sum scores from multiple functions', () => {
    const priority = combine(
      boost(m => m.role === 'user', 100),
      (_, { index }) => index,
    );
    const user = { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] };

    expect(priority(user, createContext(5))).toBe(105); // 100 + 5
  });

  it('should return Infinity if any function returns Infinity', () => {
    const priority = combine(
      pin(m => m.role === 'system'),
      boost(m => m.role === 'user', 100),
    );
    const system = { role: 'system' as const, content: 'test' };

    expect(priority(system, createContext(0))).toBe(Infinity);
  });

  it('should return -Infinity if any function returns -Infinity', () => {
    const priority = combine(
      drop(m => m.role === 'tool'),
      boost(m => m.role === 'user', 100),
    );
    const tool = { role: 'tool' as const, content: [{ type: 'tool-result' as const, toolCallId: '1', toolName: 'test', output: { type: 'text' as const, value: 'result' } }] };

    expect(priority(tool, createContext(0))).toBe(-Infinity);
  });
});
