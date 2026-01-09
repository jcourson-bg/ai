import React from 'react';
import type { MdxTreeNode } from 'ai';

export type MdxComponentMap = Record<
  string,
  React.ComponentType<any> | keyof JSX.IntrinsicElements
>;

/**
 * Render a JSON-serializable MDX tree (from `ai`) into React elements.
 *
 * For React Native, provide a `components` map for tags like `p`, `strong`, `code`, etc.
 * (React Native does not support DOM tag strings like 'p'.)
 */
export function renderMdxTree(
  node: MdxTreeNode | null | undefined,
  options: {
    components?: MdxComponentMap;
    /**
     * Optional wrapper used for the document root.
     * In React Native, a common choice is `Text` for purely inline output
     * or `View` for block layouts.
     */
    Root?: React.ComponentType<{ children: React.ReactNode }>;
  } = {},
): React.ReactNode {
  if (node == null) return null;

  const { components = {}, Root } = options;

  function renderNode(current: MdxTreeNode, key: string): React.ReactNode {
    if (current.type === 'text') {
      return current.value;
    }

    const Comp = components[current.name] ?? current.name;
    const children = (current.children ?? []).map((child, index) =>
      renderNode(child, `${key}.${index}`),
    );

    return React.createElement(
      Comp as any,
      { key, ...(current.props ?? {}) },
      children,
    );
  }

  const rendered = renderNode(node, 'mdx');

  // If a Root wrapper is provided, treat the passed node as a document root:
  return Root != null ? <Root>{rendered}</Root> : rendered;
}
