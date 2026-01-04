import { openai } from '@ai-sdk/openai';
import { contextWindow, generateText, wrapLanguageModel } from 'ai';
import 'dotenv/config';

/**
 * Basic example of using the context window middleware.
 *
 * The middleware automatically prunes messages to fit within the
 * specified token limit, keeping the most recent and important messages.
 */
async function main() {
  // Create a model with context window management
  const model = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: contextWindow({
      // GPT-4o has 128k context, reserve 28k for output
      maxPromptTokens: 100000,

      // Keep at least the last 3 messages
      keepRecentMessages: 3,

      // Log when messages are pruned
      onPrune: result => {
        console.log(
          `Pruned ${result.removedCount} messages. ` +
            `Using ${result.totalTokens} tokens.`,
        );
      },
    }),
  });

  // Simulate a long conversation history
  const longHistory = [];
  for (let i = 0; i < 50; i++) {
    longHistory.push({
      role: 'user' as const,
      content: `This is user message ${i}. `.repeat(100), // ~400 chars each
    });
    longHistory.push({
      role: 'assistant' as const,
      content: `This is assistant response ${i}. `.repeat(100),
    });
  }

  // Add the final user message
  longHistory.push({
    role: 'user' as const,
    content: 'Summarize our entire conversation.',
  });

  console.log(`Sending ${longHistory.length} messages...`);

  // The middleware will automatically prune to fit within the token limit
  const result = await generateText({
    model,
    system: 'You are a helpful assistant.',
    messages: longHistory,
  });

  console.log('\nResponse:', result.text.slice(0, 200) + '...');
  console.log('\nUsage:', result.usage);
}

main().catch(console.error);
