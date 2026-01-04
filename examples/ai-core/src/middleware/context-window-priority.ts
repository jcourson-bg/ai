import {
  contextWindow,
  byRole,
  pin,
  boost,
  combine,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';

async function main() {
  // Example 1: Simple role-based priority
  const model1 = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: contextWindow({
      maxTokens: 100000,
      priority: byRole({
        system: Infinity, // Always keep
        user: 1000,
        assistant: 500,
        tool: 100,
      }),
    }),
  });

  // Example 2: Custom priority function
  const model2 = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: contextWindow({
      maxTokens: 100000,
      priority: (message, { index }) => {
        // System messages are always kept
        if (message.role === 'system') return Infinity;

        // User messages are high priority
        if (message.role === 'user') return 1000 + index;

        // Tool results are low priority
        if (message.role === 'tool') return index;

        // Everything else uses recency
        return 500 + index;
      },
    }),
  });

  // Example 3: Composable priority functions
  const model3 = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: contextWindow({
      maxTokens: 100000,
      priority: combine(
        // Pin system messages
        pin(m => m.role === 'system'),
        // Boost user messages
        boost(m => m.role === 'user', 500),
        // Add recency
        (_, { index }) => index,
      ),
      onDrop: info => {
        console.log(`Dropped ${info.count} messages (${info.tokens} tokens)`);
      },
    }),
  });

  console.log('Created 3 models with different priority configurations');
}

main().catch(console.error);
