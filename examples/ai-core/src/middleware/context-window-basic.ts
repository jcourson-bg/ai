import { contextWindow, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';

async function main() {
  // Wrap a model with context window management
  const model = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: contextWindow({
      maxTokens: 100000,
      // Default: recency-based (newer messages kept)
    }),
  });

  console.log('Model wrapped with context window middleware');
  console.log('Max tokens:', 100000);
}

main().catch(console.error);
