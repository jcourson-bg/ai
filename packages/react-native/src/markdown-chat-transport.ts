import type {
  MarkdownRoot,
  MarkdownTreeChunk,
  MarkdownTreePatch,
} from './types';
import { applyMarkdownTreePatch } from './apply-patch';

/**
 * Extended TextUIPart that includes a pre-parsed markdown tree.
 * This is what you get when using the MarkdownChatTransport.
 */
export interface MarkdownTextUIPart {
  type: 'text';
  text: string;
  /**
   * Pre-parsed markdown tree from the server.
   * Use this with MarkdownRenderer for efficient React Native rendering.
   */
  markdownTree?: MarkdownRoot;
  state?: 'streaming' | 'done';
}

/**
 * Configuration for the markdown-enhanced chat transport.
 */
export interface MarkdownChatTransportConfig {
  /**
   * The API endpoint for chat.
   * Default: '/api/chat'
   */
  api?: string;

  /**
   * Additional headers to send with requests.
   */
  headers?: Record<string, string>;

  /**
   * Credentials mode for fetch.
   */
  credentials?: RequestCredentials;

  /**
   * Custom fetch implementation.
   */
  fetch?: typeof fetch;
}

/**
 * State for tracking markdown trees during streaming.
 */
interface MarkdownStreamState {
  trees: Map<string, MarkdownRoot>;
  textPartIds: Map<string, string>; // Maps text part index to tree ID
}

/**
 * Creates a fetch wrapper that handles the markdown-enhanced response format.
 *
 * The server should use `createMarkdownEnhancedStream` which sends:
 * 1. Standard UI message chunks (text-delta, tool-input, etc.)
 * 2. Markdown tree chunks (markdown-tree-patch, markdown-tree-snapshot)
 *
 * This wrapper intercepts the response, processes markdown trees,
 * and attaches them to the corresponding text parts.
 */
export function createMarkdownFetch(
  config: MarkdownChatTransportConfig = {},
): typeof fetch {
  const { fetch: baseFetch = globalThis.fetch } = config;

  return async function markdownFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await baseFetch(input, init);

    if (!response.ok || !response.body) {
      return response;
    }

    // Check if this is a markdown-enhanced stream
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      return response;
    }

    // Create a transform stream that processes markdown chunks
    const state: MarkdownStreamState = {
      trees: new Map(),
      textPartIds: new Map(),
    };

    const transformedBody = response.body.pipeThrough(
      createMarkdownTransformStream(state),
    );

    return new Response(transformedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/**
 * Creates a transform stream that processes markdown tree chunks
 * and enhances text chunks with markdown trees.
 */
function createMarkdownTransformStream(
  state: MarkdownStreamState,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          controller.enqueue(encoder.encode(line + '\n'));
          continue;
        }

        const data = line.slice(6);
        if (data === '[DONE]') {
          controller.enqueue(encoder.encode(line + '\n'));
          continue;
        }

        try {
          const parsed = JSON.parse(data);

          // Handle markdown tree chunks
          if (parsed.type?.startsWith('markdown-tree-')) {
            processMarkdownChunk(parsed as MarkdownTreeChunk, state);
            // Don't forward markdown tree chunks - they're handled internally
            continue;
          }

          // For text chunks, try to attach the markdown tree
          if (parsed.type === 'text-end' || parsed.type === 'text-delta') {
            const treeId = state.textPartIds.get(parsed.id);
            if (treeId) {
              const tree = state.trees.get(treeId);
              if (tree) {
                parsed.markdownTree = tree;
              }
            }
          }

          // Forward the (possibly enhanced) chunk
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(parsed)}\n`),
          );
        } catch {
          // Not JSON, forward as-is
          controller.enqueue(encoder.encode(line + '\n'));
        }
      }
    },

    flush(controller) {
      if (buffer) {
        controller.enqueue(encoder.encode(buffer));
      }
    },
  });
}

function processMarkdownChunk(
  chunk: MarkdownTreeChunk,
  state: MarkdownStreamState,
): void {
  switch (chunk.type) {
    case 'markdown-tree-start':
      state.trees.set(chunk.id, { type: 'root', children: [] });
      break;

    case 'markdown-tree-snapshot':
      state.trees.set(chunk.id, chunk.tree);
      break;

    case 'markdown-tree-patch':
      const currentTree = state.trees.get(chunk.id);
      if (currentTree) {
        state.trees.set(
          chunk.id,
          applyMarkdownTreePatch(currentTree, chunk.patch),
        );
      }
      break;

    case 'markdown-tree-end':
      state.trees.set(chunk.id, chunk.tree);
      break;
  }
}

/**
 * Hook enhancement that adds markdown trees to text parts.
 *
 * Use this with the standard useChat when your server sends
 * markdown tree data alongside the regular stream.
 */
export function enhanceMessagesWithMarkdown<
  T extends {
    parts: Array<{ type: string; text?: string; markdownTree?: MarkdownRoot }>;
  },
>(messages: T[]): T[] {
  return messages.map(message => ({
    ...message,
    parts: message.parts.map(part => {
      if (part.type === 'text' && part.markdownTree) {
        return { ...part };
      }
      return part;
    }),
  }));
}
