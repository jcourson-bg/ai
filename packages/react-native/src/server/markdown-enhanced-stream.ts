import type { MarkdownRoot, MarkdownTreeChunk } from '../types';
import { StreamingMarkdownParser } from './markdown-parser';
import { createMarkdownTreeDiff } from './markdown-tree-diff';

/**
 * Options for creating a markdown-enhanced UI message stream.
 */
export interface MarkdownEnhancedStreamOptions {
  /**
   * Generate unique IDs for markdown trees.
   * Default: simple incrementing ID.
   */
  generateTreeId?: () => string;

  /**
   * Minimum interval between tree patches (ms).
   * Default: 50ms
   */
  throttleMs?: number;
}

let treeIdCounter = 0;
function defaultGenerateTreeId(): string {
  return `md-tree-${++treeIdCounter}-${Date.now()}`;
}

/**
 * Creates a TransformStream that intercepts text content and adds
 * markdown tree chunks alongside the standard UI message chunks.
 *
 * This allows you to use the standard AI SDK streaming while also
 * getting server-parsed markdown trees for React Native.
 *
 * @example
 * ```ts
 * import { streamText } from 'ai';
 * import { createMarkdownEnhancedTransform } from '@ai-sdk/react-native/server';
 *
 * export async function POST(req: Request) {
 *   const { messages } = await req.json();
 *
 *   const result = streamText({
 *     model: openai('gpt-4o'),
 *     messages,
 *   });
 *
 *   // Pipe through the markdown enhancer
 *   const enhancedStream = result.toUIMessageStream()
 *     .pipeThrough(createMarkdownEnhancedTransform());
 *
 *   return new Response(enhancedStream, {
 *     headers: { 'Content-Type': 'text/event-stream' },
 *   });
 * }
 * ```
 */
export function createMarkdownEnhancedTransform(
  options: MarkdownEnhancedStreamOptions = {},
): TransformStream<Uint8Array, Uint8Array> {
  const { generateTreeId = defaultGenerateTreeId, throttleMs = 50 } = options;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Track active text parts and their parsers
  const textParts = new Map<
    string,
    {
      parser: StreamingMarkdownParser;
      treeId: string;
      lastTree: MarkdownRoot | null;
      lastSendTime: number;
    }
  >();

  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // Forward the original line
        controller.enqueue(encoder.encode(line + '\n'));

        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          // Handle text-start: create a new parser
          if (parsed.type === 'text-start') {
            const treeId = generateTreeId();
            textParts.set(parsed.id, {
              parser: new StreamingMarkdownParser(),
              treeId,
              lastTree: null,
              lastSendTime: 0,
            });

            // Send tree start
            const startChunk: MarkdownTreeChunk = {
              type: 'markdown-tree-start',
              id: treeId,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(startChunk)}\n`),
            );
          }

          // Handle text-delta: update the parser and send patches
          if (parsed.type === 'text-delta' && parsed.delta) {
            const textPart = textParts.get(parsed.id);
            if (textPart) {
              const newTree = textPart.parser.append(parsed.delta);
              const now = Date.now();

              // Throttle updates
              if (now - textPart.lastSendTime >= throttleMs) {
                const treeChunk = createTreeChunk(
                  textPart.treeId,
                  textPart.lastTree,
                  newTree,
                );
                if (treeChunk) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(treeChunk)}\n`),
                  );
                }
                textPart.lastTree = newTree;
                textPart.lastSendTime = now;
              }
            }
          }

          // Handle text-end: send final tree
          if (parsed.type === 'text-end') {
            const textPart = textParts.get(parsed.id);
            if (textPart) {
              const finalTree = textPart.parser.getTree();
              const endChunk: MarkdownTreeChunk = {
                type: 'markdown-tree-end',
                id: textPart.treeId,
                tree: finalTree,
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(endChunk)}\n`),
              );
              textParts.delete(parsed.id);
            }
          }
        } catch {
          // Not JSON, ignore
        }
      }
    },

    flush(controller) {
      if (buffer) {
        controller.enqueue(encoder.encode(buffer));
      }

      // Send final trees for any incomplete text parts
      for (const [_, textPart] of textParts) {
        const finalTree = textPart.parser.getTree();
        const endChunk: MarkdownTreeChunk = {
          type: 'markdown-tree-end',
          id: textPart.treeId,
          tree: finalTree,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(endChunk)}\n`),
        );
      }
      textParts.clear();
    },
  });
}

function createTreeChunk(
  treeId: string,
  oldTree: MarkdownRoot | null,
  newTree: MarkdownRoot,
): MarkdownTreeChunk | null {
  if (!oldTree) {
    return {
      type: 'markdown-tree-snapshot',
      id: treeId,
      tree: newTree,
    };
  }

  const patch = createMarkdownTreeDiff(oldTree, newTree);
  if (patch.length === 0) {
    return null;
  }

  // If the patch is a full replacement, send a snapshot instead
  if (patch.length === 1 && patch[0].op === 'replace' && patch[0].path === '') {
    return {
      type: 'markdown-tree-snapshot',
      id: treeId,
      tree: newTree,
    };
  }

  return {
    type: 'markdown-tree-patch',
    id: treeId,
    patch,
  };
}

/**
 * Wraps a UI message stream Response to add markdown tree parsing.
 *
 * This is the easiest way to add server-side markdown parsing to
 * your existing AI SDK setup.
 *
 * @example
 * ```ts
 * import { streamText } from 'ai';
 * import { wrapWithMarkdownParsing } from '@ai-sdk/react-native/server';
 *
 * export async function POST(req: Request) {
 *   const { messages } = await req.json();
 *
 *   const result = streamText({
 *     model: openai('gpt-4o'),
 *     messages,
 *   });
 *
 *   // Just wrap the response!
 *   return wrapWithMarkdownParsing(result.toUIMessageStreamResponse());
 * }
 * ```
 */
export function wrapWithMarkdownParsing(
  response: Response,
  options?: MarkdownEnhancedStreamOptions,
): Response {
  if (!response.body) {
    return response;
  }

  const transformedBody = response.body.pipeThrough(
    createMarkdownEnhancedTransform(options),
  );

  return new Response(transformedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
