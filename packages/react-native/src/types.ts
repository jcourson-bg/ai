/**
 * Base interface for all markdown tree nodes
 */
export interface MarkdownNodeBase {
  type: string;
}

/**
 * Root node containing the entire markdown document
 */
export interface MarkdownRoot extends MarkdownNodeBase {
  type: 'root';
  children: MarkdownNode[];
}

/**
 * Paragraph containing inline content
 */
export interface MarkdownParagraph extends MarkdownNodeBase {
  type: 'paragraph';
  children: MarkdownInlineNode[];
}

/**
 * Heading with depth level 1-6
 */
export interface MarkdownHeading extends MarkdownNodeBase {
  type: 'heading';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: MarkdownInlineNode[];
}

/**
 * Plain text content
 */
export interface MarkdownText extends MarkdownNodeBase {
  type: 'text';
  value: string;
}

/**
 * Bold/strong text
 */
export interface MarkdownStrong extends MarkdownNodeBase {
  type: 'strong';
  children: MarkdownInlineNode[];
}

/**
 * Italic/emphasized text
 */
export interface MarkdownEmphasis extends MarkdownNodeBase {
  type: 'emphasis';
  children: MarkdownInlineNode[];
}

/**
 * Strikethrough text
 */
export interface MarkdownStrikethrough extends MarkdownNodeBase {
  type: 'strikethrough';
  children: MarkdownInlineNode[];
}

/**
 * Fenced code block
 */
export interface MarkdownCode extends MarkdownNodeBase {
  type: 'code';
  lang?: string;
  meta?: string;
  value: string;
}

/**
 * Inline code
 */
export interface MarkdownInlineCode extends MarkdownNodeBase {
  type: 'inlineCode';
  value: string;
}

/**
 * Hyperlink
 */
export interface MarkdownLink extends MarkdownNodeBase {
  type: 'link';
  url: string;
  title?: string;
  children: MarkdownInlineNode[];
}

/**
 * Image
 */
export interface MarkdownImage extends MarkdownNodeBase {
  type: 'image';
  url: string;
  alt?: string;
  title?: string;
}

/**
 * Ordered or unordered list
 */
export interface MarkdownList extends MarkdownNodeBase {
  type: 'list';
  ordered: boolean;
  start?: number;
  spread?: boolean;
  children: MarkdownListItem[];
}

/**
 * List item
 */
export interface MarkdownListItem extends MarkdownNodeBase {
  type: 'listItem';
  spread?: boolean;
  checked?: boolean | null;
  children: MarkdownNode[];
}

/**
 * Block quote
 */
export interface MarkdownBlockquote extends MarkdownNodeBase {
  type: 'blockquote';
  children: MarkdownNode[];
}

/**
 * Thematic break (horizontal rule)
 */
export interface MarkdownThematicBreak extends MarkdownNodeBase {
  type: 'thematicBreak';
}

/**
 * Line break
 */
export interface MarkdownBreak extends MarkdownNodeBase {
  type: 'break';
}

/**
 * Table
 */
export interface MarkdownTable extends MarkdownNodeBase {
  type: 'table';
  align?: Array<'left' | 'center' | 'right' | null>;
  children: MarkdownTableRow[];
}

/**
 * Table row
 */
export interface MarkdownTableRow extends MarkdownNodeBase {
  type: 'tableRow';
  children: MarkdownTableCell[];
}

/**
 * Table cell
 */
export interface MarkdownTableCell extends MarkdownNodeBase {
  type: 'tableCell';
  children: MarkdownInlineNode[];
}

/**
 * HTML content (raw)
 */
export interface MarkdownHtml extends MarkdownNodeBase {
  type: 'html';
  value: string;
}

/**
 * All inline node types
 */
export type MarkdownInlineNode =
  | MarkdownText
  | MarkdownStrong
  | MarkdownEmphasis
  | MarkdownStrikethrough
  | MarkdownInlineCode
  | MarkdownLink
  | MarkdownImage
  | MarkdownBreak
  | MarkdownHtml;

/**
 * All block-level node types
 */
export type MarkdownBlockNode =
  | MarkdownParagraph
  | MarkdownHeading
  | MarkdownCode
  | MarkdownList
  | MarkdownBlockquote
  | MarkdownThematicBreak
  | MarkdownTable
  | MarkdownHtml;

/**
 * All markdown node types (union)
 */
export type MarkdownNode =
  | MarkdownRoot
  | MarkdownParagraph
  | MarkdownHeading
  | MarkdownText
  | MarkdownStrong
  | MarkdownEmphasis
  | MarkdownStrikethrough
  | MarkdownCode
  | MarkdownInlineCode
  | MarkdownLink
  | MarkdownImage
  | MarkdownList
  | MarkdownListItem
  | MarkdownBlockquote
  | MarkdownThematicBreak
  | MarkdownBreak
  | MarkdownTable
  | MarkdownTableRow
  | MarkdownTableCell
  | MarkdownHtml;

/**
 * Operation types for JSON patching
 */
export type MarkdownTreePatchOp =
  | {
      op: 'replace';
      path: string;
      value: unknown;
    }
  | {
      op: 'add';
      path: string;
      value: unknown;
    }
  | {
      op: 'remove';
      path: string;
    }
  | {
      op: 'append-text';
      path: string;
      value: string;
    };

/**
 * A batch of patch operations
 */
export type MarkdownTreePatch = MarkdownTreePatchOp[];

/**
 * UI Message chunk types for markdown tree streaming
 */
export type MarkdownTreeChunk =
  | {
      type: 'markdown-tree-start';
      id: string;
    }
  | {
      type: 'markdown-tree-patch';
      id: string;
      patch: MarkdownTreePatch;
    }
  | {
      type: 'markdown-tree-snapshot';
      id: string;
      tree: MarkdownRoot;
    }
  | {
      type: 'markdown-tree-end';
      id: string;
      tree: MarkdownRoot;
    };

/**
 * Message with markdown tree
 */
export interface MarkdownMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  markdownTree?: MarkdownRoot;
  createdAt?: Date;
}

/**
 * Props for custom component renderers
 */
export interface MarkdownComponentProps<T extends MarkdownNode = MarkdownNode> {
  node: T;
  children?: React.ReactNode;
}

/**
 * Custom components map for MarkdownRenderer
 */
export interface MarkdownComponents {
  root?: React.ComponentType<MarkdownComponentProps<MarkdownRoot>>;
  paragraph?: React.ComponentType<MarkdownComponentProps<MarkdownParagraph>>;
  heading?: React.ComponentType<
    MarkdownComponentProps<MarkdownHeading> & { level: 1 | 2 | 3 | 4 | 5 | 6 }
  >;
  text?: React.ComponentType<MarkdownComponentProps<MarkdownText>>;
  strong?: React.ComponentType<MarkdownComponentProps<MarkdownStrong>>;
  emphasis?: React.ComponentType<MarkdownComponentProps<MarkdownEmphasis>>;
  strikethrough?: React.ComponentType<
    MarkdownComponentProps<MarkdownStrikethrough>
  >;
  code?: React.ComponentType<
    MarkdownComponentProps<MarkdownCode> & { language?: string; value: string }
  >;
  inlineCode?: React.ComponentType<
    MarkdownComponentProps<MarkdownInlineCode> & { value: string }
  >;
  link?: React.ComponentType<
    MarkdownComponentProps<MarkdownLink> & { href: string; title?: string }
  >;
  image?: React.ComponentType<
    MarkdownComponentProps<MarkdownImage> & {
      src: string;
      alt?: string;
      title?: string;
    }
  >;
  list?: React.ComponentType<
    MarkdownComponentProps<MarkdownList> & { ordered: boolean }
  >;
  listItem?: React.ComponentType<MarkdownComponentProps<MarkdownListItem>>;
  blockquote?: React.ComponentType<MarkdownComponentProps<MarkdownBlockquote>>;
  thematicBreak?: React.ComponentType<
    MarkdownComponentProps<MarkdownThematicBreak>
  >;
  break?: React.ComponentType<MarkdownComponentProps<MarkdownBreak>>;
  table?: React.ComponentType<MarkdownComponentProps<MarkdownTable>>;
  tableRow?: React.ComponentType<MarkdownComponentProps<MarkdownTableRow>>;
  tableCell?: React.ComponentType<MarkdownComponentProps<MarkdownTableCell>>;
  html?: React.ComponentType<
    MarkdownComponentProps<MarkdownHtml> & { value: string }
  >;
}
