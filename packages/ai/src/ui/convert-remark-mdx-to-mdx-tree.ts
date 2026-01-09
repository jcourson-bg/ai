import type { MdxTree, MdxTreeElementNode, MdxTreeNode } from './mdx-tree';

/**
 * Converts a remark/MDX AST (mdast) into the AI SDK's JSON-serializable `MdxTree`.
 *
 * This helper intentionally does **not** depend on remark/unified packages.
 * It accepts `unknown` input and converts common mdast node shapes by convention.
 *
 * Typical server usage:
 *
 * - Parse markdown/MDX with your preferred remark pipeline (e.g. unified + remark-parse + remark-mdx)
 * - Convert the resulting mdast into `MdxTree` with this function
 * - Stream `data-mdxTree` snapshots / `data-mdxPatch` patches to clients
 */
export function convertRemarkMdxToMdxTree(input: unknown): MdxTree {
  return convertNode(input);
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function convertChildren(node: AnyRecord): MdxTreeNode[] {
  const children = asArray(node.children);
  return children.map(convertNode).filter((x): x is MdxTreeNode => x != null);
}

function element(
  name: string,
  options: { props?: Record<string, unknown>; children?: MdxTreeNode[] } = {},
): MdxTreeElementNode {
  return {
    type: 'element',
    name,
    ...(options.props != null ? { props: options.props } : {}),
    ...(options.children != null ? { children: options.children } : {}),
  };
}

function convertNode(node: unknown): MdxTreeNode {
  if (!isRecord(node)) {
    // Non-object nodes (or null/undefined) are not part of mdast; treat as empty text.
    return { type: 'text', value: '' };
  }

  const type = node.type;
  if (typeof type !== 'string') {
    return { type: 'text', value: '' };
  }

  switch (type) {
    case 'root':
      return element('root', { children: convertChildren(node) });

    case 'paragraph':
      return element('p', { children: convertChildren(node) });

    case 'heading': {
      const depth = typeof node.depth === 'number' ? node.depth : 1;
      const d = Math.min(6, Math.max(1, depth));
      return element(`h${d}`, { children: convertChildren(node) });
    }

    case 'text':
      return {
        type: 'text',
        value: typeof node.value === 'string' ? node.value : '',
      };

    case 'emphasis':
      return element('em', { children: convertChildren(node) });

    case 'strong':
      return element('strong', { children: convertChildren(node) });

    case 'delete':
      return element('del', { children: convertChildren(node) });

    case 'inlineCode':
      return element('code', {
        props: {},
        children: [
          {
            type: 'text',
            value: typeof node.value === 'string' ? node.value : '',
          },
        ],
      });

    case 'code': {
      const value = typeof node.value === 'string' ? node.value : '';
      const lang = typeof node.lang === 'string' ? node.lang : undefined;
      return element('pre', {
        children: [
          element('code', {
            props: lang != null ? { lang } : {},
            children: [{ type: 'text', value }],
          }),
        ],
      });
    }

    case 'link': {
      const href = typeof node.url === 'string' ? node.url : undefined;
      const title = typeof node.title === 'string' ? node.title : undefined;
      return element('a', {
        props: {
          ...(href != null ? { href } : {}),
          ...(title != null ? { title } : {}),
        },
        children: convertChildren(node),
      });
    }

    case 'list': {
      const ordered = node.ordered === true;
      const start = typeof node.start === 'number' ? node.start : undefined;
      return element(ordered ? 'ol' : 'ul', {
        props: ordered && start != null ? { start } : {},
        children: convertChildren(node),
      });
    }

    case 'listItem':
      return element('li', { children: convertChildren(node) });

    case 'blockquote':
      return element('blockquote', { children: convertChildren(node) });

    case 'thematicBreak':
      return element('hr');

    case 'break':
      return element('br');

    case 'image': {
      const src = typeof node.url === 'string' ? node.url : undefined;
      const alt = typeof node.alt === 'string' ? node.alt : undefined;
      const title = typeof node.title === 'string' ? node.title : undefined;
      return element('img', {
        props: {
          ...(src != null ? { src } : {}),
          ...(alt != null ? { alt } : {}),
          ...(title != null ? { title } : {}),
        },
      });
    }

    // MDX JSX components:
    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement': {
      const name = typeof node.name === 'string' ? node.name : 'Component';
      const props = convertMdxJsxAttributes(node.attributes);
      return element(name, { props, children: convertChildren(node) });
    }

    // Fallback: preserve structure by mapping unknown nodes to a span.
    default:
      return element('span', { children: convertChildren(node) });
  }
}

function convertMdxJsxAttributes(attributes: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const attr of asArray(attributes)) {
    if (!isRecord(attr)) continue;
    if (attr.type !== 'mdxJsxAttribute') continue;
    const name = attr.name;
    if (typeof name !== 'string') continue;

    const value = attr.value;
    // - `<X disabled />` => value null => true
    // - `<X title="hi" />` => string
    // - expression values are not evaluated here
    if (value == null) {
      out[name] = true;
    } else if (typeof value === 'string') {
      out[name] = value;
    }
  }

  return out;
}
