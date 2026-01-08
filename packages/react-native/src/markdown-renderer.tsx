import React, { memo, useMemo } from 'react';
import type {
  MarkdownBlockquote,
  MarkdownBreak,
  MarkdownCode,
  MarkdownComponents,
  MarkdownEmphasis,
  MarkdownHeading,
  MarkdownHtml,
  MarkdownImage,
  MarkdownInlineCode,
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
} from './types';

/**
 * Props for the MarkdownRenderer component.
 */
export interface MarkdownRendererProps {
  /**
   * The markdown tree to render.
   */
  tree: MarkdownRoot | null | undefined;

  /**
   * Custom components for rendering markdown elements.
   * If not provided, default components are used.
   */
  components?: Partial<MarkdownComponents>;

  /**
   * Additional props to pass to all rendered components.
   */
  componentProps?: Record<string, unknown>;

  /**
   * Key prefix for rendered elements.
   * Useful when rendering multiple trees.
   */
  keyPrefix?: string;
}

/**
 * Default text component (fallback for React Native Text)
 */
const DefaultText: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
}> = ({ children, style }) => {
  // This is a fallback - in a real React Native app, you'd use RN's Text
  return React.createElement('span', { style }, children);
};

/**
 * Default view component (fallback for React Native View)
 */
const DefaultView: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
}> = ({ children, style }) => {
  // This is a fallback - in a real React Native app, you'd use RN's View
  return React.createElement('div', { style }, children);
};

/**
 * Default components for rendering markdown.
 * These are designed to work in both web and React Native environments.
 */
const defaultComponents: MarkdownComponents = {
  root: ({ children }) => <DefaultView>{children}</DefaultView>,

  paragraph: ({ children }) => (
    <DefaultText style={{ marginBottom: 8 }}>{children}</DefaultText>
  ),

  heading: ({ level, children }) => {
    const sizes: Record<number, number> = {
      1: 32,
      2: 28,
      3: 24,
      4: 20,
      5: 18,
      6: 16,
    };
    return (
      <DefaultText
        style={{
          fontSize: sizes[level],
          fontWeight: 'bold',
          marginTop: 16,
          marginBottom: 8,
        }}
      >
        {children}
      </DefaultText>
    );
  },

  text: ({ node }) => <>{node.value}</>,

  strong: ({ children }) => (
    <DefaultText style={{ fontWeight: 'bold' }}>{children}</DefaultText>
  ),

  emphasis: ({ children }) => (
    <DefaultText style={{ fontStyle: 'italic' }}>{children}</DefaultText>
  ),

  strikethrough: ({ children }) => (
    <DefaultText style={{ textDecorationLine: 'line-through' }}>
      {children}
    </DefaultText>
  ),

  code: ({ language, value }) => (
    <DefaultView
      style={{
        backgroundColor: '#f5f5f5',
        padding: 12,
        borderRadius: 4,
        marginVertical: 8,
      }}
    >
      {language && (
        <DefaultText style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
          {language}
        </DefaultText>
      )}
      <DefaultText style={{ fontFamily: 'monospace', fontSize: 14 }}>
        {value}
      </DefaultText>
    </DefaultView>
  ),

  inlineCode: ({ value }) => (
    <DefaultText
      style={{
        fontFamily: 'monospace',
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 4,
        borderRadius: 2,
      }}
    >
      {value}
    </DefaultText>
  ),

  link: ({ href, children }) => (
    <DefaultText style={{ color: '#0066cc', textDecorationLine: 'underline' }}>
      {children}
    </DefaultText>
  ),

  image: ({ src, alt }) => (
    <DefaultView style={{ marginVertical: 8 }}>
      <DefaultText style={{ color: '#666' }}>[Image: {alt || src}]</DefaultText>
    </DefaultView>
  ),

  list: ({ ordered, children }) => (
    <DefaultView style={{ marginVertical: 8 }}>{children}</DefaultView>
  ),

  listItem: ({ children }) => (
    <DefaultView style={{ flexDirection: 'row', marginVertical: 2 }}>
      <DefaultText style={{ marginRight: 8 }}>•</DefaultText>
      <DefaultView style={{ flex: 1 }}>{children}</DefaultView>
    </DefaultView>
  ),

  blockquote: ({ children }) => (
    <DefaultView
      style={{
        borderLeftWidth: 4,
        borderLeftColor: '#ddd',
        paddingLeft: 12,
        marginVertical: 8,
      }}
    >
      <DefaultText style={{ fontStyle: 'italic', color: '#666' }}>
        {children}
      </DefaultText>
    </DefaultView>
  ),

  thematicBreak: () => (
    <DefaultView
      style={{
        height: 1,
        backgroundColor: '#ddd',
        marginVertical: 16,
      }}
    />
  ),

  break: () => <DefaultText>{'\n'}</DefaultText>,

  table: ({ children }) => (
    <DefaultView style={{ marginVertical: 8 }}>{children}</DefaultView>
  ),

  tableRow: ({ children }) => (
    <DefaultView style={{ flexDirection: 'row' }}>{children}</DefaultView>
  ),

  tableCell: ({ children }) => (
    <DefaultView
      style={{
        flex: 1,
        padding: 8,
        borderWidth: 1,
        borderColor: '#ddd',
      }}
    >
      <DefaultText>{children}</DefaultText>
    </DefaultView>
  ),

  html: ({ value }) => (
    <DefaultText style={{ color: '#999' }}>{value}</DefaultText>
  ),
};

/**
 * Render a single markdown node.
 */
function renderNode(
  node: MarkdownNode,
  components: MarkdownComponents,
  keyPrefix: string,
  index: number,
): React.ReactNode {
  const key = `${keyPrefix}-${index}`;

  switch (node.type) {
    case 'root': {
      const RootComponent = components.root || defaultComponents.root!;
      return (
        <RootComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-root`, i),
          )}
        </RootComponent>
      );
    }

    case 'paragraph': {
      const ParagraphComponent =
        components.paragraph || defaultComponents.paragraph!;
      return (
        <ParagraphComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-p`, i),
          )}
        </ParagraphComponent>
      );
    }

    case 'heading': {
      const HeadingComponent = components.heading || defaultComponents.heading!;
      return (
        <HeadingComponent key={key} node={node} level={node.depth}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-h`, i),
          )}
        </HeadingComponent>
      );
    }

    case 'text': {
      const TextComponent = components.text || defaultComponents.text!;
      return <TextComponent key={key} node={node} />;
    }

    case 'strong': {
      const StrongComponent = components.strong || defaultComponents.strong!;
      return (
        <StrongComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-strong`, i),
          )}
        </StrongComponent>
      );
    }

    case 'emphasis': {
      const EmphasisComponent =
        components.emphasis || defaultComponents.emphasis!;
      return (
        <EmphasisComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-em`, i),
          )}
        </EmphasisComponent>
      );
    }

    case 'strikethrough': {
      const StrikethroughComponent =
        components.strikethrough || defaultComponents.strikethrough!;
      return (
        <StrikethroughComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-s`, i),
          )}
        </StrikethroughComponent>
      );
    }

    case 'code': {
      const CodeComponent = components.code || defaultComponents.code!;
      return (
        <CodeComponent
          key={key}
          node={node}
          language={node.lang}
          value={node.value}
        />
      );
    }

    case 'inlineCode': {
      const InlineCodeComponent =
        components.inlineCode || defaultComponents.inlineCode!;
      return <InlineCodeComponent key={key} node={node} value={node.value} />;
    }

    case 'link': {
      const LinkComponent = components.link || defaultComponents.link!;
      return (
        <LinkComponent key={key} node={node} href={node.url} title={node.title}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-link`, i),
          )}
        </LinkComponent>
      );
    }

    case 'image': {
      const ImageComponent = components.image || defaultComponents.image!;
      return (
        <ImageComponent
          key={key}
          node={node}
          src={node.url}
          alt={node.alt}
          title={node.title}
        />
      );
    }

    case 'list': {
      const ListComponent = components.list || defaultComponents.list!;
      return (
        <ListComponent key={key} node={node} ordered={node.ordered}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-list`, i),
          )}
        </ListComponent>
      );
    }

    case 'listItem': {
      const ListItemComponent =
        components.listItem || defaultComponents.listItem!;
      return (
        <ListItemComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-li`, i),
          )}
        </ListItemComponent>
      );
    }

    case 'blockquote': {
      const BlockquoteComponent =
        components.blockquote || defaultComponents.blockquote!;
      return (
        <BlockquoteComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-bq`, i),
          )}
        </BlockquoteComponent>
      );
    }

    case 'thematicBreak': {
      const ThematicBreakComponent =
        components.thematicBreak || defaultComponents.thematicBreak!;
      return <ThematicBreakComponent key={key} node={node} />;
    }

    case 'break': {
      const BreakComponent = components.break || defaultComponents.break!;
      return <BreakComponent key={key} node={node} />;
    }

    case 'table': {
      const TableComponent = components.table || defaultComponents.table!;
      return (
        <TableComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-table`, i),
          )}
        </TableComponent>
      );
    }

    case 'tableRow': {
      const TableRowComponent =
        components.tableRow || defaultComponents.tableRow!;
      return (
        <TableRowComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-tr`, i),
          )}
        </TableRowComponent>
      );
    }

    case 'tableCell': {
      const TableCellComponent =
        components.tableCell || defaultComponents.tableCell!;
      return (
        <TableCellComponent key={key} node={node}>
          {node.children.map((child, i) =>
            renderNode(child, components, `${key}-td`, i),
          )}
        </TableCellComponent>
      );
    }

    case 'html': {
      const HtmlComponent = components.html || defaultComponents.html!;
      return <HtmlComponent key={key} node={node} value={node.value} />;
    }

    default:
      console.warn(`Unknown node type: ${(node as MarkdownNode).type}`);
      return null;
  }
}

/**
 * Renders a markdown tree to React components.
 *
 * This component is optimized for efficient rendering in React Native.
 * It renders the pre-parsed JSON tree directly to components, avoiding
 * the need for client-side markdown parsing.
 *
 * @example
 * ```tsx
 * import { MarkdownRenderer } from '@ai-sdk/react-native';
 * import { Text, View } from 'react-native';
 *
 * function ChatMessage({ message }) {
 *   return (
 *     <MarkdownRenderer
 *       tree={message.markdownTree}
 *       components={{
 *         paragraph: ({ children }) => (
 *           <Text style={styles.paragraph}>{children}</Text>
 *         ),
 *         code: ({ language, value }) => (
 *           <CodeBlock language={language}>{value}</CodeBlock>
 *         ),
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
  tree,
  components: customComponents = {},
  keyPrefix = 'md',
}: MarkdownRendererProps): React.ReactElement | null {
  // Merge custom components with defaults
  const components = useMemo(
    () => ({
      ...defaultComponents,
      ...customComponents,
    }),
    [customComponents],
  );

  if (!tree) {
    return null;
  }

  return <>{renderNode(tree, components, keyPrefix, 0)}</>;
});

/**
 * HOC to create a memoized markdown component.
 * Useful for creating custom renderers that only re-render when the tree changes.
 */
export function createMarkdownComponent<P extends { tree: MarkdownRoot }>(
  Component: React.ComponentType<P & { renderedTree: React.ReactNode }>,
  components?: Partial<MarkdownComponents>,
): React.ComponentType<P> {
  return memo(function MarkdownComponent(props: P) {
    const renderedTree = useMemo(
      () => <MarkdownRenderer tree={props.tree} components={components} />,
      [props.tree],
    );

    return <Component {...props} renderedTree={renderedTree} />;
  });
}

export { defaultComponents };
