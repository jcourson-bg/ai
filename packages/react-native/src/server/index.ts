// Server-side markdown parsing and streaming utilities
export {
  parseMarkdownToTree,
  StreamingMarkdownParser,
} from './markdown-parser';

export {
  applyMarkdownTreePatch,
  createMarkdownTreeDiff,
  estimatePatchEfficiency,
  isStreamingAppend,
} from './markdown-tree-diff';

export {
  createMarkdownStreamFromStreamText,
  createMarkdownStreamResponse,
  createMarkdownStreamResponseFromStreamText,
  createMarkdownTreeStream,
  type CreateMarkdownStreamResponseOptions,
  type MarkdownStreamOptions,
  type MarkdownUIMessageChunk,
  type MarkdownUIMessageStreamOptions,
} from './markdown-stream';

// Enhanced streaming that works with standard useChat
export {
  createMarkdownEnhancedTransform,
  wrapWithMarkdownParsing,
  type MarkdownEnhancedStreamOptions,
} from './markdown-enhanced-stream';

// Re-export types
export type {
  MarkdownBlockNode,
  MarkdownBlockquote,
  MarkdownBreak,
  MarkdownCode,
  MarkdownEmphasis,
  MarkdownHeading,
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
  MarkdownText,
  MarkdownThematicBreak,
  MarkdownTreeChunk,
  MarkdownTreePatch,
  MarkdownTreePatchOp,
} from '../types';
