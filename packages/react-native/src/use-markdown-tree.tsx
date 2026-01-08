import React, { useMemo, memo } from 'react';
import type { MarkdownRoot } from './types';
import { parseMarkdownToTree } from './server/markdown-parser';
import {
  MarkdownRenderer,
  type MarkdownRendererProps,
} from './markdown-renderer';

export interface UseMarkdownTreeOptions {
  /**
   * Whether to parse the markdown. Set to false to disable parsing.
   * Useful for conditional rendering.
   */
  enabled?: boolean;
}

/**
 * Hook to parse markdown text into a tree structure.
 *
 * This hook memoizes the parsing result to avoid re-parsing on every render.
 * Use this when you want to render markdown content from text parts.
 *
 * @example
 * ```tsx
 * function TextPartRenderer({ part }: { part: TextUIPart }) {
 *   const tree = useMarkdownTree(part.text);
 *
 *   return <MarkdownRenderer tree={tree} />;
 * }
 * ```
 */
export function useMarkdownTree(
  text: string | undefined | null,
  options: UseMarkdownTreeOptions = {},
): MarkdownRoot | null {
  const { enabled = true } = options;

  return useMemo(() => {
    if (!enabled || !text) {
      return null;
    }
    return parseMarkdownToTree(text);
  }, [text, enabled]);
}

/**
 * Props for the MarkdownText component.
 */
export interface MarkdownTextProps extends Omit<MarkdownRendererProps, 'tree'> {
  /**
   * The markdown text to render.
   */
  text: string | undefined | null;

  /**
   * Fallback content to show when text is empty.
   */
  fallback?: React.ReactNode;

  /**
   * Whether to parse and render the markdown.
   * Set to false to just show the raw text.
   */
  parseMarkdown?: boolean;
}

/**
 * Component that renders markdown text efficiently.
 *
 * This component parses markdown on the client and renders it using
 * the MarkdownRenderer. For even better performance on React Native,
 * consider using server-side parsing with the /server utilities.
 *
 * @example
 * ```tsx
 * // Basic usage with text part
 * function MessagePart({ part }: { part: TextUIPart }) {
 *   return <MarkdownText text={part.text} />;
 * }
 *
 * // With custom components
 * function MessagePart({ part }: { part: TextUIPart }) {
 *   return (
 *     <MarkdownText
 *       text={part.text}
 *       components={{
 *         code: ({ value, language }) => (
 *           <SyntaxHighlighter language={language}>{value}</SyntaxHighlighter>
 *         ),
 *       }}
 *     />
 *   );
 * }
 *
 * // Usage in a full chat message
 * function ChatMessage({ message }: { message: UIMessage }) {
 *   return (
 *     <View>
 *       {message.parts.map((part, index) => {
 *         switch (part.type) {
 *           case 'text':
 *             return <MarkdownText key={index} text={part.text} />;
 *           case 'reasoning':
 *             return <ReasoningPart key={index} part={part} />;
 *           case 'tool-*':
 *             return <ToolPart key={index} part={part} />;
 *           default:
 *             return null;
 *         }
 *       })}
 *     </View>
 *   );
 * }
 * ```
 */
export const MarkdownText = memo(function MarkdownText({
  text,
  fallback = null,
  parseMarkdown = true,
  ...rendererProps
}: MarkdownTextProps): React.ReactElement | null {
  const tree = useMarkdownTree(text, { enabled: parseMarkdown });

  if (!text) {
    return <>{fallback}</>;
  }

  if (!parseMarkdown || !tree) {
    // Return raw text without markdown parsing
    return <>{text}</>;
  }

  return <MarkdownRenderer tree={tree} {...rendererProps} />;
});

/**
 * Utility function to parse markdown text to a tree.
 *
 * Use this for one-off parsing outside of React components.
 * Inside components, prefer useMarkdownTree for memoization.
 */
export { parseMarkdownToTree } from './server/markdown-parser';
