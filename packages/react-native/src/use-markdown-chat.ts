import { useCallback, useEffect, useRef, useState } from 'react';
import throttle from 'throttleit';
import type {
  MarkdownMessage,
  MarkdownRoot,
  MarkdownTreeChunk,
  MarkdownTreePatch,
} from './types';
import { applyMarkdownTreePatch } from './apply-patch';

export type MarkdownChatStatus = 'ready' | 'streaming' | 'submitted' | 'error';

export interface UseMarkdownChatOptions {
  /**
   * The API endpoint to send messages to.
   */
  api: string;

  /**
   * Optional unique identifier for this chat.
   */
  id?: string;

  /**
   * Initial messages to populate the chat.
   */
  initialMessages?: MarkdownMessage[];

  /**
   * Additional headers to send with requests.
   */
  headers?: Record<string, string>;

  /**
   * Additional body parameters to send with requests.
   */
  body?: Record<string, unknown>;

  /**
   * Throttle interval for UI updates during streaming (ms).
   * Default: 50ms
   */
  throttleMs?: number;

  /**
   * Callback when an error occurs.
   */
  onError?: (error: Error) => void;

  /**
   * Callback when streaming finishes.
   */
  onFinish?: (message: MarkdownMessage) => void;

  /**
   * Callback when a new message is received.
   */
  onMessage?: (message: MarkdownMessage) => void;

  /**
   * Custom fetch implementation.
   * Useful for React Native where you might need to use a polyfill.
   */
  fetch?: typeof fetch;

  /**
   * Generate a unique ID for messages.
   */
  generateId?: () => string;
}

export interface UseMarkdownChatHelpers {
  /**
   * The current messages in the chat.
   */
  messages: MarkdownMessage[];

  /**
   * Set the messages directly.
   */
  setMessages: React.Dispatch<React.SetStateAction<MarkdownMessage[]>>;

  /**
   * Send a new message.
   */
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;

  /**
   * Stop the current streaming response.
   */
  stop: () => void;

  /**
   * Reload and regenerate the last assistant response.
   */
  reload: () => Promise<void>;

  /**
   * The current status of the chat.
   */
  status: MarkdownChatStatus;

  /**
   * The current error, if any.
   */
  error?: Error;

  /**
   * Clear the error state.
   */
  clearError: () => void;

  /**
   * Whether the chat is currently loading/streaming.
   */
  isLoading: boolean;

  /**
   * The current input value (for controlled input).
   */
  input: string;

  /**
   * Set the input value.
   */
  setInput: React.Dispatch<React.SetStateAction<string>>;

  /**
   * Handle input change event.
   */
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string,
  ) => void;

  /**
   * Handle form submission.
   */
  handleSubmit: (e?: React.FormEvent) => void;
}

export interface SendMessageOptions {
  /**
   * Additional headers for this specific request.
   */
  headers?: Record<string, string>;

  /**
   * Additional body parameters for this specific request.
   */
  body?: Record<string, unknown>;
}

// Simple ID generator
function defaultGenerateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * React hook for chat with optimized markdown tree streaming.
 *
 * This hook is designed for React Native and provides efficient markdown
 * rendering through server-side parsing and JSON patch streaming.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, status } = useMarkdownChat({
 *   api: '/api/chat',
 * });
 *
 * return (
 *   <ScrollView>
 *     {messages.map(message => (
 *       <View key={message.id}>
 *         {message.markdownTree ? (
 *           <MarkdownRenderer tree={message.markdownTree} />
 *         ) : (
 *           <Text>{message.content}</Text>
 *         )}
 *       </View>
 *     ))}
 *   </ScrollView>
 * );
 * ```
 */
export function useMarkdownChat(
  options: UseMarkdownChatOptions,
): UseMarkdownChatHelpers {
  const {
    api,
    id: chatId,
    initialMessages = [],
    headers: globalHeaders,
    body: globalBody,
    throttleMs = 50,
    onError,
    onFinish,
    onMessage,
    fetch: fetchFn = fetch,
    generateId = defaultGenerateId,
  } = options;

  const [messages, setMessages] = useState<MarkdownMessage[]>(initialMessages);
  const [status, setStatus] = useState<MarkdownChatStatus>('ready');
  const [error, setError] = useState<Error | undefined>();
  const [input, setInput] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentTreeRef = useRef<MarkdownRoot | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // Throttled update function
  const updateMessageTree = useCallback(
    (messageId: string, tree: MarkdownRoot, content: string) => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === messageId);
        if (idx === -1) return prev;

        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          markdownTree: tree,
          content,
        };
        return updated;
      });
    },
    [],
  );

  const throttledUpdateTree = useCallback(
    throttle(updateMessageTree, throttleMs),
    [updateMessageTree, throttleMs],
  );

  const processSSEStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      messageId: string,
    ) => {
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const chunk: MarkdownTreeChunk = JSON.parse(data);
                processChunk(chunk, messageId, fullContent);

                // Extract content from tree for storage
                if (
                  chunk.type === 'markdown-tree-snapshot' ||
                  chunk.type === 'markdown-tree-end'
                ) {
                  fullContent = extractTextFromTree(chunk.tree);
                }
              } catch (e) {
                console.warn('Failed to parse SSE chunk:', e);
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          throw err;
        }
      }
    },
    [throttledUpdateTree],
  );

  const processChunk = useCallback(
    (chunk: MarkdownTreeChunk, messageId: string, _currentContent: string) => {
      switch (chunk.type) {
        case 'markdown-tree-start':
          currentTreeRef.current = { type: 'root', children: [] };
          currentMessageIdRef.current = messageId;
          break;

        case 'markdown-tree-snapshot':
          currentTreeRef.current = chunk.tree;
          throttledUpdateTree(
            messageId,
            chunk.tree,
            extractTextFromTree(chunk.tree),
          );
          break;

        case 'markdown-tree-patch':
          if (currentTreeRef.current) {
            currentTreeRef.current = applyMarkdownTreePatch(
              currentTreeRef.current,
              chunk.patch,
            );
            throttledUpdateTree(
              messageId,
              currentTreeRef.current,
              extractTextFromTree(currentTreeRef.current),
            );
          }
          break;

        case 'markdown-tree-end':
          currentTreeRef.current = chunk.tree;
          // Final update without throttling
          updateMessageTree(
            messageId,
            chunk.tree,
            extractTextFromTree(chunk.tree),
          );
          break;
      }
    },
    [throttledUpdateTree, updateMessageTree],
  );

  const sendMessage = useCallback(
    async (content: string, sendOptions: SendMessageOptions = {}) => {
      if (status === 'streaming' || status === 'submitted') {
        return;
      }

      const userMessage: MarkdownMessage = {
        id: generateId(),
        role: 'user',
        content,
        createdAt: new Date(),
      };

      const assistantMessage: MarkdownMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);
      setStatus('submitted');
      setError(undefined);

      // Reset refs
      currentTreeRef.current = null;
      currentMessageIdRef.current = assistantMessage.id;

      // Create abort controller
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetchFn(api, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...globalHeaders,
            ...sendOptions.headers,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({
              role: m.role,
              content: m.content,
            })),
            chatId,
            ...globalBody,
            ...sendOptions.body,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        setStatus('streaming');

        const reader = response.body.getReader();
        await processSSEStream(reader, assistantMessage.id);

        setStatus('ready');

        // Get final message
        const finalMessages = await new Promise<MarkdownMessage[]>(resolve => {
          setMessages(prev => {
            resolve(prev);
            return prev;
          });
        });

        const finalAssistantMessage = finalMessages.find(
          m => m.id === assistantMessage.id,
        );
        if (finalAssistantMessage) {
          onFinish?.(finalAssistantMessage);
          onMessage?.(finalAssistantMessage);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setStatus('ready');
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
    [
      api,
      chatId,
      fetchFn,
      generateId,
      globalBody,
      globalHeaders,
      messages,
      onError,
      onFinish,
      onMessage,
      processSSEStream,
      status,
    ],
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('ready');
  }, []);

  const reload = useCallback(async () => {
    // Find the last user message
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];

    // Remove the last assistant message if it exists
    const newMessages = messages.slice(0, lastUserMessageIndex);
    setMessages(newMessages);

    // Resend the user message
    await sendMessage(lastUserMessage.content);
  }, [messages, sendMessage]);

  const clearError = useCallback(() => {
    setError(undefined);
    if (status === 'error') {
      setStatus('ready');
    }
  }, [status]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) => {
      const value = typeof e === 'string' ? e : e.target.value;
      setInput(value);
    },
    [],
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (input.trim()) {
        sendMessage(input.trim());
        setInput('');
      }
    },
    [input, sendMessage],
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
    messages,
    setMessages,
    sendMessage,
    stop,
    reload,
    status,
    error,
    clearError,
    isLoading: status === 'streaming' || status === 'submitted',
    input,
    setInput,
    handleInputChange,
    handleSubmit,
  };
}

/**
 * Extract plain text content from a markdown tree.
 * Useful for storing the content alongside the tree structure.
 */
function extractTextFromTree(tree: MarkdownRoot): string {
  const parts: string[] = [];

  function traverse(node: MarkdownRoot | MarkdownRoot['children'][number]) {
    if ('value' in node && typeof node.value === 'string') {
      parts.push(node.value);
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(tree);
  return parts.join('');
}
