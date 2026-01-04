import { openai } from '@ai-sdk/openai';
import { ManagedContextAgent, tool } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

/**
 * Example of using ManagedContextAgent for an agent with automatic
 * context window management.
 *
 * This agent can handle arbitrarily long conversations without
 * exceeding token limits.
 */
async function main() {
  // Create an agent with built-in context management
  const researchAgent = new ManagedContextAgent({
    id: 'research-agent',

    model: openai('gpt-4o'),

    // Context management configuration
    context: {
      preset: 'gpt-4o', // Use GPT-4o's token limits
      strategy: 'priority-based',

      // Custom priority: keep user messages over tool results
      assignPriority: message => {
        if (message.role === 'system') return 'critical';
        if (message.role === 'user') return 'high';
        if (message.role === 'tool') return 'low';
        return 'normal';
      },

      // Log when context is pruned
      onPrune: result => {
        console.log(`📉 Context pruned: removed ${result.removedCount} messages`);
        console.log(`   Now using ${result.totalTokens} estimated tokens`);
      },
    },

    instructions: `You are a research assistant. You can search for information
    and analyze documents. Always provide thorough, well-researched answers.`,

    tools: {
      search: tool({
        description: 'Search for information on a topic',
        inputSchema: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query }) => {
          // Simulate search results
          console.log(`🔍 Searching: ${query}`);
          return {
            results: [
              { title: 'Result 1', snippet: `Information about ${query}...` },
              { title: 'Result 2', snippet: `More details on ${query}...` },
            ],
          };
        },
      }),

      analyze: tool({
        description: 'Analyze a document or text',
        inputSchema: z.object({
          text: z.string().describe('The text to analyze'),
        }),
        execute: async ({ text }) => {
          console.log(`📊 Analyzing: ${text.substring(0, 50)}...`);
          return {
            wordCount: text.split(' ').length,
            sentiment: 'neutral',
            keyTopics: ['topic1', 'topic2'],
          };
        },
      }),
    },
  });

  console.log('🤖 Research Agent initialized\n');

  // Simulate a conversation
  const result = await researchAgent.generate({
    prompt: 'Research the history of artificial intelligence and summarize the key milestones.',
  });

  console.log('\n📝 Response:');
  console.log(result.text);

  // Show tool usage
  if (result.toolCalls.length > 0) {
    console.log('\n🔧 Tools used:', result.toolCalls.map(tc => tc.toolName));
  }

  console.log('\n📊 Usage:', result.usage);
}

main().catch(console.error);
