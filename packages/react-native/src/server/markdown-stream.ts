import type {
  MarkdownRoot,
  MarkdownTreeChunk,
  MarkdownTreePatch,
} from '../types';
import {
  StreamingMarkdownParser,
  parseMarkdownToTree,
} from './markdown-parser';
import {
  createMarkdownTreeDiff,
  isStreamingAppend,
} from './markdown-tree-diff';

// Simple ID generator
function generateIdFunc(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export interface MarkdownStreamOptions {
  /**
   * Generate a unique ID for the markdown tree.
   * Defaults to the AI SDK's generateId function.
   */
  generateId?: () => string;

  /**
   * Minimum interval between patches in milliseconds.
   * Batches rapid updates to reduce patch frequency.
   * Default: 50ms
   */
  throttleMs?: number;

  /**
   * Maximum number of patches before sending a full snapshot.
   * This helps prevent patch accumulation issues.
   * Default: 20
   */
  maxPatchesBeforeSnapshot?: number;

  /**
   * Whether to send the initial tree as a snapshot.
   * Default: true
   */
  sendInitialSnapshot?: boolean;
}

/**
 * Transform a text stream into a markdown tree stream.
 *
 * This takes a stream of text chunks (e.g., from an LLM) and transforms it
 * into a stream of markdown tree patches optimized for React Native rendering.
 */
export function createMarkdownTreeStream(
  textStream: ReadableStream<string>,
  options: MarkdownStreamOptions = {},
): ReadableStream<MarkdownTreeChunk> {
  const {
    generateId = generateIdFunc,
    throttleMs = 50,
    maxPatchesBeforeSnapshot = 20,
    sendInitialSnapshot = true,
  } = options;

  const treeId = generateId();
  const parser = new StreamingMarkdownParser();
  let lastTree: MarkdownRoot | null = null;
  let patchCount = 0;
  let lastSendTime = 0;
  let pendingChunks: string[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return new ReadableStream<MarkdownTreeChunk>({
    async start(controller) {
      // Send start event
      controller.enqueue({ type: 'markdown-tree-start', id: treeId });

      const reader = textStream.getReader();

      const flushPendingChunks = () => {
        if (pendingChunks.length === 0) return;

        // Append all pending chunks
        for (const chunk of pendingChunks) {
          parser.append(chunk);
        }
        pendingChunks = [];

        const newTree = parser.getTree();

        // Decide whether to send patch or snapshot
        const shouldSendSnapshot =
          patchCount >= maxPatchesBeforeSnapshot ||
          (lastTree === null && sendInitialSnapshot);

        if (shouldSendSnapshot) {
          controller.enqueue({
            type: 'markdown-tree-snapshot',
            id: treeId,
            tree: newTree,
          });
          patchCount = 0;
        } else {
          const patch = createMarkdownTreeDiff(lastTree, newTree);

          if (patch.length > 0) {
            controller.enqueue({
              type: 'markdown-tree-patch',
              id: treeId,
              patch,
            });
            patchCount++;
          }
        }

        lastTree = newTree;
        lastSendTime = Date.now();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Clear any pending timeout
            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            // Flush any remaining chunks
            flushPendingChunks();

            // Send final tree
            const finalTree = parser.getTree();
            controller.enqueue({
              type: 'markdown-tree-end',
              id: treeId,
              tree: finalTree,
            });

            controller.close();
            break;
          }

          // Add chunk to pending
          pendingChunks.push(value);

          // Check if we should flush immediately or throttle
          const now = Date.now();
          const timeSinceLastSend = now - lastSendTime;

          if (timeSinceLastSend >= throttleMs) {
            // Enough time has passed, flush immediately
            flushPendingChunks();
          } else if (!timeoutId) {
            // Schedule a flush
            timeoutId = setTimeout(() => {
              timeoutId = null;
              flushPendingChunks();
            }, throttleMs - timeSinceLastSend);
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Options for creating a markdown stream response
 */
export interface CreateMarkdownStreamResponseOptions {
  /**
   * Additional headers to include in the response.
   */
  headers?: Record<string, string>;

  /**
   * Status code for the response.
   * Default: 200
   */
  status?: number;

  /**
   * Callback called when streaming starts.
   */
  onStart?: (treeId: string) => void;

  /**
   * Callback called for each chunk sent.
   */
  onChunk?: (chunk: MarkdownTreeChunk) => void;

  /**
   * Callback called when streaming finishes.
   */
  onFinish?: (tree: MarkdownRoot) => void;

  /**
   * Callback called on error.
   */
  onError?: (error: Error) => void;

  /**
   * Markdown stream options.
   */
  streamOptions?: MarkdownStreamOptions;
}

/**
 * Create an HTTP Response that streams markdown tree updates.
 *
 * This can be used with Next.js, Express, or any other framework that
 * supports the standard Response API.
 *
 * @example
 * ```ts
 * // Next.js App Router
 * export async function POST(req: Request) {
 *   const result = streamText({
 *     model: openai('gpt-4o'),
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *   });
 *
 *   return createMarkdownStreamResponse(result.textStream);
 * }
 * ```
 */
export function createMarkdownStreamResponse(
  textStream: ReadableStream<string>,
  options: CreateMarkdownStreamResponseOptions = {},
): Response {
  const {
    headers = {},
    status = 200,
    onStart,
    onChunk,
    onFinish,
    onError,
    streamOptions,
  } = options;

  const markdownStream = createMarkdownTreeStream(textStream, streamOptions);

  // Transform to SSE format
  const sseStream = new ReadableStream({
    async start(controller) {
      const reader = markdownStream.getReader();
      const encoder = new TextEncoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Call appropriate callbacks
          if (value.type === 'markdown-tree-start') {
            onStart?.(value.id);
          } else if (value.type === 'markdown-tree-end') {
            onFinish?.(value.tree);
          }

          onChunk?.(value);

          // Format as SSE
          const data = JSON.stringify(value);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        controller.close();
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
        controller.error(error);
      }
    },
  });

  return new Response(sseStream, {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...headers,
    },
  });
}

/**
 * Parse a complete markdown string and return it as a tree.
 *
 * Use this for non-streaming scenarios or to parse stored content.
 */
export { parseMarkdownToTree } from './markdown-parser';

/**
 * Apply a patch to a markdown tree.
 *
 * This is useful on the client side to apply received patches.
 */
export {
  applyMarkdownTreePatch,
  createMarkdownTreeDiff,
  isStreamingAppend,
} from './markdown-tree-diff';

/**
 * Integrate markdown tree streaming with AI SDK's streamText result.
 *
 * @example
 * ```ts
 * import { streamText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { createMarkdownStreamFromStreamText } from '@ai-sdk/react-native/server';
 *
 * const result = streamText({
 *   model: openai('gpt-4o'),
 *   messages,
 * });
 *
 * // Get a markdown tree stream from the text stream
 * const markdownStream = createMarkdownStreamFromStreamText(result);
 *
 * // Or get a Response directly
 * return createMarkdownStreamResponseFromStreamText(result);
 * ```
 */
export function createMarkdownStreamFromStreamText(
  result: { textStream: ReadableStream<string> },
  options?: MarkdownStreamOptions,
): ReadableStream<MarkdownTreeChunk> {
  return createMarkdownTreeStream(result.textStream, options);
}

/**
 * Create an HTTP Response from AI SDK's streamText result with markdown tree streaming.
 */
export function createMarkdownStreamResponseFromStreamText(
  result: { textStream: ReadableStream<string> },
  options?: CreateMarkdownStreamResponseOptions,
): Response {
  return createMarkdownStreamResponse(result.textStream, options);
}

/**
 * Create a UI message stream that includes markdown tree updates.
 *
 * This integrates with the AI SDK's UI message streaming system while also
 * sending parsed markdown tree updates for efficient React Native rendering.
 */
export interface MarkdownUIMessageStreamOptions extends MarkdownStreamOptions {
  /**
   * Whether to include the raw text in addition to the markdown tree.
   * Default: false
   */
  includeRawText?: boolean;
}

/**
 * Custom chunk types that can be sent alongside standard UI message chunks.
 */
export type MarkdownUIMessageChunk =
  | { type: 'markdown-tree-start'; id: string }
  | { type: 'markdown-tree-patch'; id: string; patch: MarkdownTreePatch }
  | { type: 'markdown-tree-snapshot'; id: string; tree: MarkdownRoot }
  | { type: 'markdown-tree-end'; id: string; tree: MarkdownRoot };
