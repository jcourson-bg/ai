# AI SDK React Native

React Native integration for the [AI SDK](https://ai-sdk.dev/docs) with optimized markdown streaming.

## Overview

This package provides React Native-optimized hooks and utilities for building AI-powered chat applications. The key innovation is **server-side markdown parsing with JSON tree streaming**, which dramatically improves rendering performance on React Native.

### The Problem

Parsing markdown in React Native is expensive. Traditional approaches send raw text to the client, where it must be parsed on every render. This creates:

- High CPU usage during streaming
- Janky animations and scrolling
- Battery drain on mobile devices

### The Solution

Instead of streaming raw markdown text, this package:

1. **Parses markdown on the server** into a JSON tree structure
2. **Streams JSON patches** to the client for efficient updates
3. **Renders native components** directly from the tree

This approach, inspired by v0's mobile app, shifts the expensive parsing work to the server where it belongs.

## Installation

```bash
npm install @ai-sdk/react-native
```

## Usage

### Client Side (React Native)

```tsx
import { useMarkdownChat, MarkdownRenderer } from '@ai-sdk/react-native';
import { View, Text, ScrollView } from 'react-native';

function ChatScreen() {
  const { messages, sendMessage, status } = useMarkdownChat({
    api: '/api/chat',
  });

  return (
    <ScrollView>
      {messages.map(message => (
        <View key={message.id}>
          {message.role === 'assistant' ? (
            <MarkdownRenderer
              tree={message.markdownTree}
              components={{
                // Custom components for each markdown element
                paragraph: ({ children }) => (
                  <Text style={styles.paragraph}>{children}</Text>
                ),
                heading: ({ level, children }) => (
                  <Text style={styles[`h${level}`]}>{children}</Text>
                ),
                code: ({ language, value }) => (
                  <CodeBlock language={language}>{value}</CodeBlock>
                ),
                // ... more components
              }}
            />
          ) : (
            <Text>{message.content}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
```

### Server Side (Next.js/Express/etc.)

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createMarkdownStreamResponse } from '@ai-sdk/react-native/server';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  });

  // Automatically parses markdown and streams JSON tree patches
  return createMarkdownStreamResponse(result);
}
```

## API Reference

### Client Hooks

#### `useMarkdownChat(options)`

A React hook for chat interfaces with optimized markdown streaming.

Options:

- `api` - The API endpoint URL
- `id` - Optional chat ID
- `initialMessages` - Initial messages array
- `onError` - Error callback
- `onFinish` - Completion callback

Returns:

- `messages` - Array of messages with `markdownTree` for assistant messages
- `sendMessage` - Function to send a new message
- `status` - Current status ('ready' | 'streaming' | 'error')
- `stop` - Function to stop streaming
- `error` - Current error if any

### Server Utilities

#### `createMarkdownStreamResponse(result, options?)`

Creates a streaming response that parses markdown and sends JSON tree patches.

Options:

- `onChunk` - Callback for each chunk
- `onFinish` - Callback when streaming completes

#### `parseMarkdownToTree(markdown)`

Parses a markdown string into a JSON tree structure.

#### `createMarkdownTreeDiff(oldTree, newTree)`

Creates a minimal diff/patch between two markdown trees.

## Markdown Tree Structure

The JSON tree uses the following node types:

```typescript
type MarkdownNode =
  | { type: 'root'; children: MarkdownNode[] }
  | { type: 'paragraph'; children: MarkdownNode[] }
  | { type: 'heading'; depth: 1 | 2 | 3 | 4 | 5 | 6; children: MarkdownNode[] }
  | { type: 'text'; value: string }
  | { type: 'strong'; children: MarkdownNode[] }
  | { type: 'emphasis'; children: MarkdownNode[] }
  | { type: 'code'; lang?: string; value: string }
  | { type: 'inlineCode'; value: string }
  | { type: 'link'; url: string; title?: string; children: MarkdownNode[] }
  | { type: 'image'; url: string; alt?: string; title?: string }
  | { type: 'list'; ordered: boolean; start?: number; children: MarkdownNode[] }
  | { type: 'listItem'; children: MarkdownNode[] }
  | { type: 'blockquote'; children: MarkdownNode[] }
  | { type: 'thematicBreak' }
  | { type: 'break' };
```

## Performance Tips

1. **Memoize custom components** passed to `MarkdownRenderer`
2. **Use `React.memo`** on parent components to prevent unnecessary re-renders
3. **Consider virtualization** for long chat histories

## License

Apache-2.0
