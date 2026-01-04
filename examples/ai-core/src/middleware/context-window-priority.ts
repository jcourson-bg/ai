import { openai } from '@ai-sdk/openai';
import { contextWindow, generateText, wrapLanguageModel } from 'ai';
import type { MessagePriority } from 'ai';
import 'dotenv/config';

/**
 * Example of using priority-based context pruning.
 *
 * This strategy keeps high-priority messages over low-priority ones,
 * regardless of their position in the conversation.
 */
async function main() {
  const model = wrapLanguageModel({
    model: openai('gpt-4o'),
    middleware: contextWindow({
      maxPromptTokens: 50000,
      strategy: 'priority-based',

      // Custom priority assignment
      assignPriority: (message, index, messages): MessagePriority => {
        // System messages are always critical
        if (message.role === 'system') {
          return 'critical';
        }

        // User messages are high priority
        if (message.role === 'user') {
          return 'high';
        }

        // Tool results are lower priority (can be regenerated)
        if (message.role === 'tool') {
          return 'low';
        }

        // Check if this is an assistant message with important content
        if (message.role === 'assistant') {
          const hasContent = message.content.some(
            part => part.type === 'text' && part.text.length > 100,
          );
          return hasContent ? 'normal' : 'low';
        }

        return 'normal';
      },

      onPrune: result => {
        console.log(`Pruned ${result.removedCount} low-priority messages`);
        console.log(`Removed indices:`, result.removedIndices);
      },
    }),
  });

  // Create a conversation with mixed priority messages
  const messages = [
    // Important user context
    {
      role: 'user' as const,
      content: 'I am working on a critical project about climate change.',
    },
    {
      role: 'assistant' as const,
      content: [
        {
          type: 'text' as const,
          text: "That's interesting! I can help with that.",
        },
      ],
    },

    // Tool calls (lower priority - results can be regenerated)
    {
      role: 'assistant' as const,
      content: [
        {
          type: 'tool-call' as const,
          toolCallId: 'call-1',
          toolName: 'search',
          input: { query: 'climate change data' },
        },
      ],
    },
    {
      role: 'tool' as const,
      content: [
        {
          type: 'tool-result' as const,
          toolCallId: 'call-1',
          toolName: 'search',
          output: {
            type: 'text' as const,
            value: 'Long search results here...'.repeat(100),
          },
        },
      ],
    },

    // More user context (high priority)
    {
      role: 'user' as const,
      content: 'Focus specifically on sea level rise data.',
    },
    {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'I found relevant data.' }],
    },

    // Final question
    {
      role: 'user' as const,
      content: 'What are the key findings?',
    },
  ];

  console.log(`Sending ${messages.length} messages with priority-based pruning...`);

  const result = await generateText({
    model,
    system:
      'You are a research assistant helping with climate change analysis.',
    messages,
  });

  console.log('\nResponse:', result.text);
}

main().catch(console.error);
