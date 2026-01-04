import { forModel, modelContextLimits, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';

async function main() {
  // Use a preset for a known model
  const model = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: forModel('gpt-4o'),
  });

  // You can also customize the preset
  const customModel = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: forModel('gpt-4o', {
      priority: (message, { index }) => {
        if (message.role === 'system') return Infinity;
        return index;
      },
      onDrop: info => {
        console.log(`Context pruned: ${info.count} messages removed`);
      },
    }),
  });

  // Check available model limits
  console.log('Available model context limits:');
  for (const [model, limit] of Object.entries(modelContextLimits)) {
    console.log(`  ${model}: ${limit.toLocaleString()} tokens`);
  }
}

main().catch(console.error);
