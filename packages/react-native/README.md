# AI SDK React Native

React Native optimized utilities for the [AI SDK](https://ai-sdk.dev/docs).

## Overview

This package provides React Native-specific optimizations for the AI SDK, including efficient markdown rendering. It re-exports all hooks from `@ai-sdk/react` so you can use the same API you're familiar with.

### Key Features

- **Same API as `@ai-sdk/react`** - `useChat`, `useCompletion`, `useObject` all work the same
- **Optimized markdown rendering** - Parse markdown to JSON trees for efficient native rendering
- **Full agent support** - Tools, multi-step, reasoning, and all other parts work as expected
- **Server-side parsing option** - For maximum performance, parse on the server and stream trees

## Installation

```bash
npm install @ai-sdk/react-native
```

## Usage

### Basic Chat with Markdown

```tsx
import { useChat } from '@ai-sdk/react-native';
import { MarkdownText } from '@ai-sdk/react-native';
import { View, Text, TextInput, Button, ScrollView } from 'react-native';

function ChatScreen() {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/chat',
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView>
        {messages.map(message => (
          <View key={message.id} style={styles.message}>
            <Text style={styles.role}>{message.role}</Text>
            {message.parts.map((part, index) => {
              switch (part.type) {
                case 'text':
                  // Use MarkdownText for efficient markdown rendering
                  return <MarkdownText key={index} text={part.text} />;

                case 'reasoning':
                  return (
                    <View key={index} style={styles.reasoning}>
                      <Text style={styles.reasoningLabel}>Thinking...</Text>
                      <MarkdownText text={part.text} />
                    </View>
                  );

                default:
                  return null;
              }
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={handleInputChange}
          placeholder="Type a message..."
          style={styles.input}
        />
        <Button
          title="Send"
          onPress={handleSubmit}
          disabled={status !== 'ready'}
        />
      </View>
    </View>
  );
}
```

### With Tool Calls (Agents)

```tsx
import { useChat, isToolUIPart, getToolName } from '@ai-sdk/react-native';
import { MarkdownText } from '@ai-sdk/react-native';

function AgentChat() {
  const { messages, sendMessage, addToolOutput } = useChat({
    api: '/api/agent',
    // Auto-execute tools
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === 'get_weather') {
        const result = await fetchWeather(toolCall.input.location);
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result,
        });
      }
    },
  });

  return (
    <ScrollView>
      {messages.map(message => (
        <View key={message.id}>
          {message.parts.map((part, index) => {
            // Text content
            if (part.type === 'text') {
              return <MarkdownText key={index} text={part.text} />;
            }

            // Tool invocations
            if (isToolUIPart(part)) {
              return (
                <ToolCard
                  key={index}
                  name={getToolName(part)}
                  state={part.state}
                  input={part.input}
                  output={part.output}
                />
              );
            }

            return null;
          })}
        </View>
      ))}
    </ScrollView>
  );
}
```

### Custom Markdown Components

```tsx
import {
  MarkdownText,
  MarkdownRenderer,
  useMarkdownTree,
} from '@ai-sdk/react-native';
import { Text, View, Linking } from 'react-native';
import SyntaxHighlighter from 'react-native-syntax-highlighter';

// Option 1: Use MarkdownText with custom components
function CustomMarkdownText({ text }) {
  return (
    <MarkdownText
      text={text}
      components={{
        paragraph: ({ children }) => (
          <Text style={styles.paragraph}>{children}</Text>
        ),
        heading: ({ level, children }) => (
          <Text style={styles[`h${level}`]}>{children}</Text>
        ),
        code: ({ language, value }) => (
          <SyntaxHighlighter language={language} style={styles.codeBlock}>
            {value}
          </SyntaxHighlighter>
        ),
        link: ({ href, children }) => (
          <Text style={styles.link} onPress={() => Linking.openURL(href)}>
            {children}
          </Text>
        ),
        strong: ({ children }) => <Text style={styles.bold}>{children}</Text>,
        emphasis: ({ children }) => (
          <Text style={styles.italic}>{children}</Text>
        ),
      }}
    />
  );
}

// Option 2: Use the hook directly for more control
function ManualMarkdown({ text }) {
  const tree = useMarkdownTree(text);

  if (!tree) return null;

  return <MarkdownRenderer tree={tree} components={customComponents} />;
}
```

### Server-Side Markdown Parsing (v0 Approach - Maximum Performance)

For the best performance on React Native, parse markdown on the server and stream JSON tree patches. This is the approach used by v0's mobile app.

**The key insight:** Don't parse markdown in React Native. Let the server do it.

#### Option 1: Wrap your existing response (Easiest!)

Just wrap your existing `toUIMessageStreamResponse()` call:

**Server:**

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { wrapWithMarkdownParsing } from '@ai-sdk/react-native/server';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  });

  // Just wrap it! Server now parses markdown and streams tree patches
  return wrapWithMarkdownParsing(result.toUIMessageStreamResponse());
}
```

**Client:**

```tsx
import {
  useChat,
  createMarkdownFetch,
  MarkdownRenderer,
} from '@ai-sdk/react-native';

function Chat() {
  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
    // Use the markdown-aware fetch
    fetch: createMarkdownFetch(),
  });

  return (
    <ScrollView>
      {messages.map(message => (
        <View key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              // The markdownTree is automatically attached by the server!
              if (part.markdownTree) {
                return (
                  <MarkdownRenderer key={index} tree={part.markdownTree} />
                );
              }
              // Fallback for non-enhanced responses
              return <MarkdownText key={index} text={part.text} />;
            }
            // Tools, reasoning, etc. all work normally
            if (isToolUIPart(part)) {
              return <ToolCard key={index} part={part} />;
            }
            return null;
          })}
        </View>
      ))}
    </ScrollView>
  );
}
```

#### Option 2: Use the transform stream directly

For more control, pipe through the transform:

**Server:**

```typescript
import { streamText } from 'ai';
import { createMarkdownEnhancedTransform } from '@ai-sdk/react-native/server';

export async function POST(req: Request) {
  const result = streamText({ model: openai('gpt-4o'), messages });

  const stream = result
    .toUIMessageStream()
    .pipeThrough(createMarkdownEnhancedTransform());

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

#### Option 3: Standalone markdown streaming

For maximum control, stream markdown trees only:

```typescript
import { createMarkdownStreamResponse } from '@ai-sdk/react-native/server';

// Server
return createMarkdownStreamResponse(result.textStream);

// Client - use useMarkdownStream hook
const { tree, stream, status } = useMarkdownStream({ api: '/api/markdown' });
```

## API Reference

### Hooks (re-exported from @ai-sdk/react)

- `useChat` - Chat hook with full message parts support
- `useCompletion` - Completion hook for simple text generation
- `useObject` - Structured object generation hook

### Markdown Utilities

#### `MarkdownText`

Component that renders markdown text with optional custom components.

```tsx
<MarkdownText
  text="# Hello **world**"
  components={
    {
      /* custom renderers */
    }
  }
  parseMarkdown={true} // set false to show raw text
  fallback={<Text>Loading...</Text>}
/>
```

#### `useMarkdownTree(text, options?)`

Hook to parse markdown text into a tree structure.

```tsx
const tree = useMarkdownTree(text);
// tree is MarkdownRoot | null
```

#### `MarkdownRenderer`

Low-level component to render a pre-parsed markdown tree.

```tsx
<MarkdownRenderer
  tree={markdownTree}
  components={customComponents}
  keyPrefix="msg-1"
/>
```

### Server Utilities

Available from `@ai-sdk/react-native/server`:

- `parseMarkdownToTree(text)` - Parse markdown to JSON tree
- `createMarkdownTreeStream(textStream)` - Transform text stream to tree patches
- `createMarkdownStreamResponse(textStream)` - Create SSE response with tree patches
- `applyMarkdownTreePatch(tree, patch)` - Apply a patch to a tree
- `createMarkdownTreeDiff(oldTree, newTree)` - Create a diff between trees

## Message Parts

The AI SDK uses a parts-based message structure. Here are the common part types:

| Part Type     | Description                                       |
| ------------- | ------------------------------------------------- |
| `text`        | Text content (use `MarkdownText` to render)       |
| `reasoning`   | Model reasoning/thinking (also supports markdown) |
| `tool-{name}` | Tool invocation with input/output                 |
| `file`        | File attachment                                   |
| `source-url`  | Source reference                                  |
| `step-start`  | Step boundary marker                              |

Use the type guards from `ai` to check part types:

```tsx
import { isTextUIPart, isToolUIPart, isReasoningUIPart } from 'ai';

message.parts.map(part => {
  if (isTextUIPart(part)) return <MarkdownText text={part.text} />;
  if (isToolUIPart(part)) return <ToolCard part={part} />;
  if (isReasoningUIPart(part)) return <Reasoning text={part.text} />;
});
```

## Performance Tips

1. **Memoize custom components** - Wrap your component map in `useMemo`
2. **Use server-side parsing** - For maximum performance, parse on the server
3. **Virtualize long lists** - Use FlatList/FlashList for chat histories
4. **Throttle updates** - Use `experimental_throttle` option in `useChat`

```tsx
const { messages } = useChat({
  api: '/api/chat',
  experimental_throttle: 50, // Throttle updates to 50ms
});
```

## License

Apache-2.0
