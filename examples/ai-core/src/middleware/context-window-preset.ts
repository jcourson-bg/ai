import { openai } from '@ai-sdk/openai';
import { contextWindowForModel, generateText, wrapLanguageModel } from 'ai';
import 'dotenv/config';

/**
 * Example using model presets for context window management.
 *
 * The SDK includes presets for popular models with appropriate token limits.
 */
async function main() {
  // Use a preset - no need to look up token limits yourself
  const model = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: contextWindowForModel('gpt-4o', {
      // Optionally override preset values
      keepRecentMessages: 5,
      onPrune: result => {
        console.log(`Context pruned: ${result.totalTokens} tokens`);
      },
    }),
  });

  // Available presets:
  // - 'gpt-4o' (100k prompt tokens)
  // - 'gpt-4o-mini' (112k prompt tokens)
  // - 'claude-3-5-sonnet' (192k prompt tokens)
  // - 'claude-3-haiku' (196k prompt tokens)
  // - 'gemini-1-5-pro' (2M prompt tokens)
  // - 'gemini-1-5-flash' (1M prompt tokens)
  // - 'gpt-4' (6k prompt tokens)
  // - 'gpt-4-32k' (28k prompt tokens)
  // - 'gpt-3-5-turbo' (12k prompt tokens)

  const result = await generateText({
    model,
    system: 'You are a helpful assistant.',
    prompt: 'What is the meaning of life?',
  });

  console.log('Response:', result.text);
}

main().catch(console.error);
