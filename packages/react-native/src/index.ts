/**
 * @ai-sdk/react-native
 *
 * React Native optimized utilities for the AI SDK.
 *
 * This package provides:
 * 1. Re-exports of @ai-sdk/react hooks (useChat, useCompletion, useObject)
 * 2. Markdown parsing utilities optimized for React Native
 * 3. MarkdownRenderer component for efficient rendering
 *
 * Usage:
 * ```tsx
 * import { useChat } from '@ai-sdk/react-native';
 * import { MarkdownRenderer, useMarkdownTree } from '@ai-sdk/react-native';
 *
 * function Chat() {
 *   const { messages, sendMessage } = useChat({ api: '/api/chat' });
 *
 *   return (
 *     <View>
 *       {messages.map(message => (
 *         <View key={message.id}>
 *           {message.parts.map((part, i) => {
 *             if (part.type === 'text') {
 *               return <MarkdownText key={i} text={part.text} />;
 *             }
 *             if (part.type === 'tool-*') {
 *               return <ToolResult key={i} part={part} />;
 *             }
 *             // ... handle other part types
 *           })}
 *         </View>
 *       ))}
 *     </View>
 *   );
 * }
 * ```
 */

// Re-export everything from @ai-sdk/react for convenience
// Users can import useChat, useCompletion, useObject directly from this package
export {
  useChat,
  useCompletion,
  experimental_useObject,
  Chat,
  type UseChatHelpers,
  type UseChatOptions,
  type CreateUIMessage,
  type UIMessage,
} from '@ai-sdk/react';

// Markdown parsing and rendering utilities
export {
  MarkdownRenderer,
  createMarkdownComponent,
  defaultComponents,
  type MarkdownRendererProps,
} from './markdown-renderer';

export {
  useMarkdownTree,
  MarkdownText,
  type UseMarkdownTreeOptions,
  type MarkdownTextProps,
} from './use-markdown-tree';

// Server-side markdown streaming (v0 approach)
export {
  useMarkdownStream,
  type UseMarkdownStreamOptions,
  type UseMarkdownStreamResult,
  type MarkdownStreamStatus,
  type MarkdownChatMessage,
} from './use-markdown-stream';

// Transport utilities for integrating with useChat
export {
  createMarkdownFetch,
  type MarkdownChatTransportConfig,
  type MarkdownTextUIPart,
} from './markdown-chat-transport';

export {
  applyMarkdownTreePatch,
  isPatchEfficient,
  mergePatchBatch,
} from './apply-patch';

// Types
export type {
  MarkdownBlockNode,
  MarkdownBlockquote,
  MarkdownBreak,
  MarkdownCode,
  MarkdownComponentProps,
  MarkdownComponents,
  MarkdownEmphasis,
  MarkdownHeading,
  MarkdownHtml,
  MarkdownImage,
  MarkdownInlineCode,
  MarkdownInlineNode,
  MarkdownLink,
  MarkdownList,
  MarkdownListItem,
  MarkdownNode,
  MarkdownNodeBase,
  MarkdownParagraph,
  MarkdownRoot,
  MarkdownStrikethrough,
  MarkdownStrong,
  MarkdownTable,
  MarkdownTableCell,
  MarkdownTableRow,
  MarkdownText as MarkdownTextNode,
  MarkdownThematicBreak,
  MarkdownTreeChunk,
  MarkdownTreePatch,
  MarkdownTreePatchOp,
} from './types';
