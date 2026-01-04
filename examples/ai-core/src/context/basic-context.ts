import { createContext, redactOldToolResults } from 'ai';

async function main() {
  // Create a context with filters
  const context = createContext({
    filters: [
      // Redact tool results older than 5 messages
      redactOldToolResults(5),
    ],
  });

  // Add messages as your conversation progresses
  context.append({ role: 'system', content: 'You are a helpful assistant.' });
  context.append({
    role: 'user',
    content: [{ type: 'text', text: 'Hello!' }],
  });
  context.append({
    role: 'assistant',
    content: [{ type: 'text', text: 'Hi! How can I help you?' }],
  });

  // Build prompt for LLM (filters are applied)
  const prompt = await context.buildPrompt();
  console.log('Prompt messages:', prompt.length);

  // Original messages are preserved
  console.log('Original messages:', context.messages.length);
}

main().catch(console.error);
