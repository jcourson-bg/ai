import {
  createContext,
  redactOldToolResults,
  summarize,
} from 'ai';
import { openai } from '@ai-sdk/openai';

async function main() {
  // Create context with compaction
  const context = createContext({
    // Filters run on every buildPrompt (cheap)
    filters: [redactOldToolResults(5)],

    // Compactor runs when triggered (expensive, uses LLM)
    compactor: summarize({
      model: openai('gpt-4o-mini'),
    }),

    // Auto-trigger compaction when token threshold exceeded
    trigger: {
      tokens: 50000,
    },

    // Keep the last 10 messages uncompacted
    keepRecent: 10,

    // Optional: get notified when compaction happens
    onCompact: segment => {
      console.log(`Compacted messages ${segment.range[0]}-${segment.range[1]}`);
      console.log(`Saved ${segment.tokens} tokens as summary`);
    },
  });

  // Simulate a long conversation
  for (let i = 0; i < 100; i++) {
    context.append({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: [{ type: 'text', text: `Message ${i}: ${'x'.repeat(100)}` }],
    });
  }

  // Manually trigger compaction
  const segment = await context.compact();
  if (segment) {
    console.log('Created segment:', segment.id);
  }

  // Build prompt - uses compacted segments + recent messages
  const prompt = await context.buildPrompt();
  console.log('Prompt messages:', prompt.length);
  console.log('Original messages:', context.messages.length);
}

main().catch(console.error);
