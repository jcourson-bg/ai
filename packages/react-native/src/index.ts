// Client-side hooks and components
export {
  useMarkdownChat,
  type MarkdownChatStatus,
  type SendMessageOptions,
  type UseMarkdownChatHelpers,
  type UseMarkdownChatOptions,
} from './use-markdown-chat';

export {
  createMarkdownComponent,
  defaultComponents,
  MarkdownRenderer,
  type MarkdownRendererProps,
} from './markdown-renderer';

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
  MarkdownMessage,
  MarkdownNode,
  MarkdownNodeBase,
  MarkdownParagraph,
  MarkdownRoot,
  MarkdownStrikethrough,
  MarkdownStrong,
  MarkdownTable,
  MarkdownTableCell,
  MarkdownTableRow,
  MarkdownText,
  MarkdownThematicBreak,
  MarkdownTreeChunk,
  MarkdownTreePatch,
  MarkdownTreePatchOp,
} from './types';
