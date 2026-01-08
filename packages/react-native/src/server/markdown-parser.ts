import type {
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
  MarkdownParagraph,
  MarkdownRoot,
  MarkdownStrikethrough,
  MarkdownStrong,
  MarkdownTable,
  MarkdownTableCell,
  MarkdownTableRow,
  MarkdownText,
  MarkdownThematicBreak,
} from '../types';

/**
 * A lightweight streaming-friendly markdown parser that produces a JSON tree.
 *
 * This parser is designed to work incrementally - it can parse partial
 * markdown content and produce a valid tree structure that can be updated
 * as more content streams in.
 */

interface ParserState {
  currentText: string;
  inCodeBlock: boolean;
  codeBlockLang?: string;
  codeBlockMeta?: string;
  codeBlockContent: string;
  inBlockquote: boolean;
  blockquoteContent: string[];
  listStack: Array<{
    ordered: boolean;
    start?: number;
    items: MarkdownListItem[];
    currentItemContent: string[];
    indent: number;
  }>;
}

function createInitialState(): ParserState {
  return {
    currentText: '',
    inCodeBlock: false,
    codeBlockLang: undefined,
    codeBlockMeta: undefined,
    codeBlockContent: '',
    inBlockquote: false,
    blockquoteContent: [],
    listStack: [],
  };
}

/**
 * Parse inline markdown content (bold, italic, code, links, etc.)
 */
function parseInlineContent(text: string): MarkdownInlineNode[] {
  const nodes: MarkdownInlineNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Check for various inline patterns
    let matched = false;

    // Inline code: `code`
    const inlineCodeMatch = remaining.match(/^`([^`]+)`/);
    if (inlineCodeMatch) {
      nodes.push({ type: 'inlineCode', value: inlineCodeMatch[1] });
      remaining = remaining.slice(inlineCodeMatch[0].length);
      matched = true;
      continue;
    }

    // Bold with asterisks: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/s);
    if (boldMatch) {
      nodes.push({
        type: 'strong',
        children: parseInlineContent(boldMatch[1]),
      });
      remaining = remaining.slice(boldMatch[0].length);
      matched = true;
      continue;
    }

    // Bold with underscores: __text__
    const boldUnderscoreMatch = remaining.match(/^__(.+?)__/s);
    if (boldUnderscoreMatch) {
      nodes.push({
        type: 'strong',
        children: parseInlineContent(boldUnderscoreMatch[1]),
      });
      remaining = remaining.slice(boldUnderscoreMatch[0].length);
      matched = true;
      continue;
    }

    // Strikethrough: ~~text~~
    const strikethroughMatch = remaining.match(/^~~(.+?)~~/s);
    if (strikethroughMatch) {
      nodes.push({
        type: 'strikethrough',
        children: parseInlineContent(strikethroughMatch[1]),
      });
      remaining = remaining.slice(strikethroughMatch[0].length);
      matched = true;
      continue;
    }

    // Italic with asterisks: *text*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      nodes.push({
        type: 'emphasis',
        children: parseInlineContent(italicMatch[1]),
      });
      remaining = remaining.slice(italicMatch[0].length);
      matched = true;
      continue;
    }

    // Italic with underscores: _text_
    const italicUnderscoreMatch = remaining.match(/^_([^_]+)_/);
    if (italicUnderscoreMatch) {
      nodes.push({
        type: 'emphasis',
        children: parseInlineContent(italicUnderscoreMatch[1]),
      });
      remaining = remaining.slice(italicUnderscoreMatch[0].length);
      matched = true;
      continue;
    }

    // Images: ![alt](url "title")
    const imageMatch = remaining.match(
      /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
    );
    if (imageMatch) {
      const image: MarkdownImage = {
        type: 'image',
        url: imageMatch[2],
        alt: imageMatch[1] || undefined,
        title: imageMatch[3] || undefined,
      };
      nodes.push(image);
      remaining = remaining.slice(imageMatch[0].length);
      matched = true;
      continue;
    }

    // Links: [text](url "title")
    const linkMatch = remaining.match(
      /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
    );
    if (linkMatch) {
      const link: MarkdownLink = {
        type: 'link',
        url: linkMatch[2],
        title: linkMatch[3] || undefined,
        children: parseInlineContent(linkMatch[1]),
      };
      nodes.push(link);
      remaining = remaining.slice(linkMatch[0].length);
      matched = true;
      continue;
    }

    // Auto-links: <url>
    const autoLinkMatch = remaining.match(/^<(https?:\/\/[^>]+)>/);
    if (autoLinkMatch) {
      const link: MarkdownLink = {
        type: 'link',
        url: autoLinkMatch[1],
        children: [{ type: 'text', value: autoLinkMatch[1] }],
      };
      nodes.push(link);
      remaining = remaining.slice(autoLinkMatch[0].length);
      matched = true;
      continue;
    }

    // Line breaks: two spaces followed by newline, or explicit <br>
    const breakMatch = remaining.match(/^(  \n|<br\s*\/?>)/i);
    if (breakMatch) {
      nodes.push({ type: 'break' } as MarkdownBreak);
      remaining = remaining.slice(breakMatch[0].length);
      matched = true;
      continue;
    }

    // If nothing matched, consume one character as text
    if (!matched) {
      // Find the next special character
      const nextSpecial = remaining.search(/[`*_~[\]<!\n]/);
      if (nextSpecial === -1) {
        // No more special characters, consume all remaining
        nodes.push({ type: 'text', value: remaining });
        remaining = '';
      } else if (nextSpecial === 0) {
        // Special character at start that didn't match any pattern
        nodes.push({ type: 'text', value: remaining[0] });
        remaining = remaining.slice(1);
      } else {
        // Consume up to the next special character
        nodes.push({ type: 'text', value: remaining.slice(0, nextSpecial) });
        remaining = remaining.slice(nextSpecial);
      }
    }
  }

  // Merge adjacent text nodes
  const merged: MarkdownInlineNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === 'text' && last?.type === 'text') {
      last.value += node.value;
    } else {
      merged.push(node);
    }
  }

  return merged;
}

/**
 * Parse a single line and determine its block type
 */
function parseBlockLine(
  line: string,
  state: ParserState,
): { type: string; node?: MarkdownNode; updateState?: Partial<ParserState> } {
  // Code block start/end
  const codeBlockMatch = line.match(/^```(\w+)?(?:\s+(.+))?$/);
  if (codeBlockMatch) {
    if (state.inCodeBlock) {
      // End of code block
      const code: MarkdownCode = {
        type: 'code',
        lang: state.codeBlockLang,
        meta: state.codeBlockMeta,
        value: state.codeBlockContent.replace(/\n$/, ''), // Remove trailing newline
      };
      return {
        type: 'code-block-end',
        node: code,
        updateState: {
          inCodeBlock: false,
          codeBlockLang: undefined,
          codeBlockMeta: undefined,
          codeBlockContent: '',
        },
      };
    } else {
      // Start of code block
      return {
        type: 'code-block-start',
        updateState: {
          inCodeBlock: true,
          codeBlockLang: codeBlockMatch[1] || undefined,
          codeBlockMeta: codeBlockMatch[2] || undefined,
          codeBlockContent: '',
        },
      };
    }
  }

  // Inside code block
  if (state.inCodeBlock) {
    return {
      type: 'code-block-content',
      updateState: {
        codeBlockContent: state.codeBlockContent + line + '\n',
      },
    };
  }

  // Thematic break
  if (/^(---+|___+|\*\*\*+)\s*$/.test(line)) {
    return {
      type: 'thematic-break',
      node: { type: 'thematicBreak' } as MarkdownThematicBreak,
    };
  }

  // Heading with # syntax
  const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const heading: MarkdownHeading = {
      type: 'heading',
      depth: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
      children: parseInlineContent(headingMatch[2].trim()),
    };
    return { type: 'heading', node: heading };
  }

  // Blockquote
  const blockquoteMatch = line.match(/^>\s?(.*)$/);
  if (blockquoteMatch) {
    return {
      type: 'blockquote',
      updateState: {
        inBlockquote: true,
        blockquoteContent: [...state.blockquoteContent, blockquoteMatch[1]],
      },
    };
  }

  // End blockquote if we were in one
  if (state.inBlockquote && !blockquoteMatch) {
    const blockquote: MarkdownBlockquote = {
      type: 'blockquote',
      children: parseMarkdownToTree(state.blockquoteContent.join('\n'))
        .children as MarkdownNode[],
    };
    return {
      type: 'blockquote-end',
      node: blockquote,
      updateState: {
        inBlockquote: false,
        blockquoteContent: [],
      },
    };
  }

  // Ordered list item (check this first to avoid matching with unordered)
  const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (orderedListMatch) {
    const indent = orderedListMatch[1].length;
    const start = parseInt(orderedListMatch[2], 10);
    const content = orderedListMatch[3];
    return {
      type: 'ordered-list-item',
      node: createListItem(content, true, start, indent),
    };
  }

  // Unordered list item
  const unorderedListMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
  if (unorderedListMatch) {
    const indent = unorderedListMatch[1].length;
    const content = unorderedListMatch[3];
    return {
      type: 'unordered-list-item',
      node: createListItem(content, false, undefined, indent),
    };
  }

  // Task list item
  const taskListMatch = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (taskListMatch) {
    const indent = taskListMatch[1].length;
    const checked = taskListMatch[3].toLowerCase() === 'x';
    const content = taskListMatch[4];
    const item = createListItem(content, false, undefined, indent);
    (item as MarkdownListItem & { checked: boolean }).checked = checked;
    return { type: 'list-item', node: item };
  }

  // Empty line
  if (line.trim() === '') {
    return { type: 'empty' };
  }

  // Table row
  const tableMatch = line.match(/^\|(.+)\|$/);
  if (tableMatch) {
    const cells = tableMatch[1].split('|').map(cell => cell.trim());
    // Check if this is a separator row
    if (cells.every(cell => /^:?-+:?$/.test(cell))) {
      return { type: 'table-separator', node: undefined };
    }
    const row: MarkdownTableRow = {
      type: 'tableRow',
      children: cells.map(cell => ({
        type: 'tableCell',
        children: parseInlineContent(cell),
      })) as MarkdownTableCell[],
    };
    return { type: 'table-row', node: row };
  }

  // Regular paragraph
  return {
    type: 'paragraph',
    node: {
      type: 'paragraph',
      children: parseInlineContent(line),
    } as MarkdownParagraph,
  };
}

function createListItem(
  content: string,
  _ordered: boolean,
  _start: number | undefined,
  _indent: number,
): MarkdownListItem {
  return {
    type: 'listItem',
    children: [
      {
        type: 'paragraph',
        children: parseInlineContent(content),
      } as MarkdownParagraph,
    ],
  };
}

/**
 * Parse a complete markdown string into a tree structure.
 */
export function parseMarkdownToTree(markdown: string): MarkdownRoot {
  const root: MarkdownRoot = {
    type: 'root',
    children: [],
  };

  const lines = markdown.split('\n');
  const state = createInitialState();

  let currentList: MarkdownList | null = null;
  let currentTable: MarkdownTable | null = null;
  let pendingParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (pendingParagraphLines.length > 0) {
      const text = pendingParagraphLines.join('\n');
      if (text.trim()) {
        root.children.push({
          type: 'paragraph',
          children: parseInlineContent(text),
        } as MarkdownParagraph);
      }
      pendingParagraphLines = [];
    }
  };

  const flushList = () => {
    if (currentList) {
      root.children.push(currentList);
      currentList = null;
    }
  };

  const flushTable = () => {
    if (currentTable) {
      root.children.push(currentTable);
      currentTable = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const result = parseBlockLine(line, state);

    // Update parser state
    if (result.updateState) {
      Object.assign(state, result.updateState);
    }

    switch (result.type) {
      case 'code-block-start':
        flushParagraph();
        flushList();
        flushTable();
        break;

      case 'code-block-content':
        // Content is accumulated in state
        break;

      case 'code-block-end':
        if (result.node) {
          root.children.push(result.node);
        }
        break;

      case 'heading':
      case 'thematic-break':
        flushParagraph();
        flushList();
        flushTable();
        if (result.node) {
          root.children.push(result.node);
        }
        break;

      case 'blockquote':
        // Accumulated in state
        break;

      case 'blockquote-end':
        flushParagraph();
        flushList();
        flushTable();
        if (result.node) {
          root.children.push(result.node);
        }
        // Re-parse the current line since it's not a blockquote
        i--;
        break;

      case 'ordered-list-item':
        flushParagraph();
        flushTable();
        if (result.node) {
          if (!currentList || !currentList.ordered) {
            flushList();
            currentList = {
              type: 'list',
              ordered: true,
              children: [],
            };
          }
          currentList.children.push(result.node as MarkdownListItem);
        }
        break;

      case 'unordered-list-item':
        flushParagraph();
        flushTable();
        if (result.node) {
          if (!currentList || currentList.ordered) {
            flushList();
            currentList = {
              type: 'list',
              ordered: false,
              children: [],
            };
          }
          currentList.children.push(result.node as MarkdownListItem);
        }
        break;

      case 'table-row':
        flushParagraph();
        flushList();
        if (!currentTable) {
          currentTable = {
            type: 'table',
            children: [],
          };
        }
        if (result.node) {
          currentTable.children.push(result.node as MarkdownTableRow);
        }
        break;

      case 'table-separator':
        // Table separator, already in table context
        break;

      case 'empty':
        flushParagraph();
        flushList();
        flushTable();
        break;

      case 'paragraph':
        flushList();
        flushTable();
        pendingParagraphLines.push(line);
        break;
    }
  }

  // Handle any remaining state
  if (state.inCodeBlock) {
    // Unclosed code block - add it anyway
    root.children.push({
      type: 'code',
      lang: state.codeBlockLang,
      meta: state.codeBlockMeta,
      value: state.codeBlockContent.replace(/\n$/, ''),
    } as MarkdownCode);
  }

  if (state.inBlockquote) {
    root.children.push({
      type: 'blockquote',
      children: parseMarkdownToTree(state.blockquoteContent.join('\n'))
        .children as MarkdownNode[],
    } as MarkdownBlockquote);
  }

  flushParagraph();
  flushList();
  flushTable();

  return root;
}

/**
 * Streaming-aware markdown parser that can handle partial content.
 *
 * This is designed to work with streaming LLM responses where the markdown
 * content arrives incrementally.
 */
export class StreamingMarkdownParser {
  private content: string = '';
  private lastTree: MarkdownRoot | null = null;

  /**
   * Append new content and get the updated tree.
   */
  append(chunk: string): MarkdownRoot {
    this.content += chunk;
    this.lastTree = parseMarkdownToTree(this.content);
    return this.lastTree;
  }

  /**
   * Get the current tree without appending.
   */
  getTree(): MarkdownRoot {
    if (!this.lastTree) {
      this.lastTree = parseMarkdownToTree(this.content);
    }
    return this.lastTree;
  }

  /**
   * Get the full content accumulated so far.
   */
  getContent(): string {
    return this.content;
  }

  /**
   * Reset the parser state.
   */
  reset(): void {
    this.content = '';
    this.lastTree = null;
  }
}
