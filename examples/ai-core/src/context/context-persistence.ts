import { Context, createContext, summarize } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as fs from 'fs';

const SNAPSHOT_PATH = './context-snapshot.json';

async function main() {
  // Try to restore from snapshot, or create new
  let context: Context;

  if (fs.existsSync(SNAPSHOT_PATH)) {
    console.log('Restoring context from snapshot...');
    const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    context = Context.fromSnapshot(data, {
      compactor: summarize({ model: openai('gpt-4o-mini') }),
      keepRecent: 10,
    });
    console.log(`Restored ${context.messages.length} messages`);
  } else {
    console.log('Creating new context...');
    context = createContext({
      compactor: summarize({ model: openai('gpt-4o-mini') }),
      keepRecent: 10,
    });
  }

  // Add some messages
  context.append({
    role: 'user',
    content: [{ type: 'text', text: 'New message at ' + new Date().toISOString() }],
  });

  // Save snapshot for persistence
  const snapshot = context.toSnapshot();
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  console.log('Saved snapshot with', snapshot.messages.length, 'messages');

  // The snapshot includes:
  // - All original messages (full history)
  // - Cached compaction segments (summaries)
  console.log('Segments:', snapshot.segments.length);
}

main().catch(console.error);
