import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarkdownRoot, MarkdownTreeChunk } from './types';
import { applyMarkdownTreePatch } from './apply-patch';

export type MarkdownStreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface UseMarkdownStreamOptions {
  /**
   * The API endpoint that streams markdown tree patches.
   * This endpoint should use `createMarkdownStreamResponse` from the server utilities.
   */
  api: string;

  /**
   * Additional headers to send with the request.
   */
  headers?: Record<string, string>;

  /**
   * Callback when streaming starts.
   */
  onStart?: () => void;

  /**
   * Callback when streaming finishes.
   */
  onFinish?: (tree: MarkdownRoot) => void;

  /**
   * Callback on error.
   */
  onError?: (error: Error) => void;

  /**
   * Custom fetch implementation.
   */
  fetch?: typeof fetch;
}

export interface UseMarkdownStreamResult {
  /**
   * The current markdown tree (updated in real-time as patches arrive).
   */
  tree: MarkdownRoot | null;

  /**
   * Current status of the stream.
   */
  status: MarkdownStreamStatus;

  /**
   * Error if any occurred.
   */
  error: Error | null;

  /**
   * Start streaming by sending a request to the API.
   */
  stream: (body: unknown) => Promise<void>;

  /**
   * Stop the current stream.
   */
  stop: () => void;

  /**
   * Reset to initial state.
   */
  reset: () => void;
}

/**
 * Hook for consuming server-streamed markdown tree patches.
 *
 * This implements the v0 approach: the server parses markdown and streams
 * JSON tree patches to the client. The client just applies patches and renders.
 *
 * **This is the recommended approach for React Native** as it moves all
 * markdown parsing work to the server.
 *
 * @example
 * ```tsx
 * // Server: use createMarkdownStreamResponse
 * // Client:
 * function StreamingMarkdown() {
 *   const { tree, stream, status } = useMarkdownStream({
 *     api: '/api/markdown-stream',
 *   });
 *
 *   return (
 *     <View>
 *       <Button onPress={() => stream({ prompt: 'Hello' })} title="Start" />
 *       {tree && <MarkdownRenderer tree={tree} />}
 *       {status === 'streaming' && <ActivityIndicator />}
 *     </View>
 *   );
 * }
 * ```
 */
export function useMarkdownStream(
  options: UseMarkdownStreamOptions,
): UseMarkdownStreamResult {
  const {
    api,
    headers: globalHeaders,
    onStart,
    onFinish,
    onError,
    fetch: fetchFn = fetch,
  } = options;

  const [tree, setTree] = useState<MarkdownRoot | null>(null);
  const [status, setStatus] = useState<MarkdownStreamStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const treeRef = useRef<MarkdownRoot | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (status === 'streaming') {
      setStatus('done');
    }
  }, [status]);

  const reset = useCallback(() => {
    stop();
    setTree(null);
    treeRef.current = null;
    setStatus('idle');
    setError(null);
  }, [stop]);

  const stream = useCallback(
    async (body: unknown) => {
      // Reset state
      setTree(null);
      treeRef.current = null;
      setError(null);
      setStatus('streaming');

      abortControllerRef.current = new AbortController();

      try {
        onStart?.();

        const response = await fetchFn(api, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...globalHeaders,
          },
          body: JSON.stringify(body),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const chunk: MarkdownTreeChunk = JSON.parse(data);

                switch (chunk.type) {
                  case 'markdown-tree-start':
                    treeRef.current = { type: 'root', children: [] };
                    setTree(treeRef.current);
                    break;

                  case 'markdown-tree-snapshot':
                    treeRef.current = chunk.tree;
                    setTree(chunk.tree);
                    break;

                  case 'markdown-tree-patch':
                    if (treeRef.current) {
                      treeRef.current = applyMarkdownTreePatch(
                        treeRef.current,
                        chunk.patch,
                      );
                      setTree(treeRef.current);
                    }
                    break;

                  case 'markdown-tree-end':
                    treeRef.current = chunk.tree;
                    setTree(chunk.tree);
                    onFinish?.(chunk.tree);
                    break;
                }
              } catch (e) {
                console.warn('Failed to parse markdown stream chunk:', e);
              }
            }
          }
        }

        setStatus('done');
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setStatus('done');
          return;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
        onError?.(error);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [api, fetchFn, globalHeaders, onStart, onFinish, onError],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    tree,
    status,
    error,
    stream,
    stop,
    reset,
  };
}

/**
 * Hook that combines useChat with server-side markdown parsing.
 *
 * This gives you the full chat experience (messages, tools, etc.) while
 * using server-side markdown parsing for text parts.
 *
 * The server should stream markdown trees using `createMarkdownStreamResponse`
 * for text content, while the standard UI message stream handles everything else.
 */
export interface MarkdownChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /**
   * Pre-parsed markdown tree from the server.
   * Only present for assistant messages when using server-side parsing.
   */
  markdownTree?: MarkdownRoot;
}
