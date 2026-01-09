export type MdxTreeTextNode = {
  type: 'text';
  value: string;
};

export type MdxTreeElementNode = {
  type: 'element';
  /**
   * Tag/component name.
   *
   * - In web React this can be a tag name like 'p' or 'h1'
   * - In React Native you typically map these names to custom components
   */
  name: string;
  props?: Record<string, unknown>;
  children?: MdxTreeNode[];
};

/**
 * A minimal, JSON-serializable “MDX tree” format that is suitable for streaming
 * to clients (including React Native).
 *
 * The intention is to parse markdown/MDX on the server into this tree and then
 * render it with a platform-specific component map on the client.
 */
export type MdxTreeNode = MdxTreeTextNode | MdxTreeElementNode;

export type MdxTree = MdxTreeNode;

/**
 * A minimal patch format that works well with streaming.
 * Uses JSON Pointer paths (RFC 6901).
 *
 * `append-text` is included because it is very common to incrementally extend
 * a string field during streaming (e.g. text nodes) without re-sending the whole tree.
 */
export type MdxTreePatch =
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'append-text'; path: string; text: string };

export function applyMdxTreePatch<T extends MdxTree>(
  tree: T,
  patch: MdxTreePatch,
): T {
  switch (patch.op) {
    case 'replace': {
      return setJsonPointerValue(tree, patch.path, patch.value) as T;
    }
    case 'append-text': {
      return appendJsonPointerText(tree, patch.path, patch.text) as T;
    }
    default: {
      const exhaustiveCheck: never = patch;
      throw new Error(`Unknown patch op: ${(exhaustiveCheck as any).op}`);
    }
  }
}

export function applyMdxTreePatches<T extends MdxTree>(
  tree: T,
  patches: readonly MdxTreePatch[],
): T {
  let current = tree;
  for (const patch of patches) {
    current = applyMdxTreePatch(current, patch);
  }
  return current;
}

function parseJsonPointer(path: string): string[] {
  if (path === '') return [];
  if (path === '/') return [''];

  if (!path.startsWith('/')) {
    throw new Error(`Invalid JSON pointer "${path}". Must start with "/".`);
  }

  return path
    .slice(1)
    .split('/')
    .map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function isIndexToken(token: string): boolean {
  // Disallow '-' (JSON Patch "append") because this helper is JSON pointer based.
  return token !== '' && /^[0-9]+$/.test(token);
}

function setJsonPointerValue(
  root: unknown,
  path: string,
  value: unknown,
): unknown {
  const tokens = parseJsonPointer(path);
  if (tokens.length === 0) return value;

  function update(current: unknown, i: number): unknown {
    const token = tokens[i]!;
    const isLast = i === tokens.length - 1;

    if (Array.isArray(current)) {
      if (!isIndexToken(token)) {
        throw new Error(
          `Invalid array index token "${token}" for path "${path}".`,
        );
      }
      const index = Number(token);
      const next = current[index];

      const updatedValue = isLast ? value : update(next, i + 1);
      const copy = current.slice();
      copy[index] = updatedValue;
      return copy;
    }

    if (current != null && typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      const next = obj[token];
      const updatedValue = isLast ? value : update(next, i + 1);
      return { ...obj, [token]: updatedValue };
    }

    // We could auto-create containers here, but it’s safer to require the path to exist.
    throw new Error(
      `Cannot set path "${path}" through non-container value at "${tokens
        .slice(0, i)
        .join('/')}".`,
    );
  }

  return update(root, 0);
}

function appendJsonPointerText(
  root: unknown,
  path: string,
  text: string,
): unknown {
  const tokens = parseJsonPointer(path);
  if (tokens.length === 0) {
    if (typeof root !== 'string') {
      throw new Error(`append-text requires string target at "${path}".`);
    }
    return root + text;
  }

  function update(current: unknown, i: number): unknown {
    const token = tokens[i]!;
    const isLast = i === tokens.length - 1;

    if (Array.isArray(current)) {
      if (!isIndexToken(token)) {
        throw new Error(
          `Invalid array index token "${token}" for path "${path}".`,
        );
      }
      const index = Number(token);
      const next = current[index];

      const updatedValue = isLast ? appendLeaf(next) : update(next, i + 1);
      const copy = current.slice();
      copy[index] = updatedValue;
      return copy;
    }

    if (current != null && typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      const next = obj[token];
      const updatedValue = isLast ? appendLeaf(next) : update(next, i + 1);
      return { ...obj, [token]: updatedValue };
    }

    throw new Error(
      `Cannot append at path "${path}" through non-container value at "${tokens
        .slice(0, i)
        .join('/')}".`,
    );
  }

  function appendLeaf(value: unknown) {
    if (value == null) {
      return text;
    }
    if (typeof value !== 'string') {
      throw new Error(`append-text requires string target at "${path}".`);
    }
    return value + text;
  }

  return update(root, 0);
}
