import type {
  MarkdownRoot,
  MarkdownTreePatch,
  MarkdownTreePatchOp,
} from './types';

/**
 * Apply a patch to a markdown tree, returning a new tree.
 *
 * This is a client-side implementation optimized for React Native.
 * It ensures immutability for proper React re-renders.
 */
export function applyMarkdownTreePatch(
  tree: MarkdownRoot | null,
  patch: MarkdownTreePatch,
): MarkdownRoot {
  // Start with a deep clone to ensure immutability
  let result = tree
    ? structuredClone(tree)
    : ({ type: 'root', children: [] } as MarkdownRoot);

  for (const op of patch) {
    result = applySingleOp(result, op);
  }

  return result;
}

type AnyObject = { [key: string]: unknown };

function applySingleOp(
  tree: MarkdownRoot,
  op: MarkdownTreePatchOp,
): MarkdownRoot {
  if (op.path === '') {
    // Replace entire tree
    if (op.op === 'replace') {
      return op.value as MarkdownRoot;
    }
    throw new Error(`Invalid operation on root: ${op.op}`);
  }

  // Parse the path
  const segments = op.path.split('/').filter(Boolean);

  // Navigate to the parent, creating a new path of references
  let current: AnyObject | unknown[] = tree as unknown as AnyObject;
  const pathToRoot: Array<{
    parent: AnyObject | unknown[];
    key: string | number;
  }> = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    if (Array.isArray(current)) {
      const index = parseInt(segment, 10);
      pathToRoot.push({ parent: current, key: index });
      current = current[index] as AnyObject;
    } else {
      pathToRoot.push({ parent: current, key: segment });
      current = current[segment] as AnyObject;
    }
  }

  const lastSegment = segments[segments.length - 1];

  switch (op.op) {
    case 'replace':
      if (Array.isArray(current)) {
        current[parseInt(lastSegment, 10)] = op.value;
      } else {
        current[lastSegment] = op.value;
      }
      break;

    case 'add':
      if (Array.isArray(current)) {
        const index = parseInt(lastSegment, 10);
        if (index === current.length) {
          current.push(op.value);
        } else {
          current.splice(index, 0, op.value);
        }
      } else {
        current[lastSegment] = op.value;
      }
      break;

    case 'remove':
      if (Array.isArray(current)) {
        current.splice(parseInt(lastSegment, 10), 1);
      } else {
        delete current[lastSegment];
      }
      break;

    case 'append-text':
      if (Array.isArray(current)) {
        const item = current[parseInt(lastSegment, 10)];
        if (typeof item === 'string') {
          current[parseInt(lastSegment, 10)] = item + op.value;
        }
      } else if (typeof current[lastSegment] === 'string') {
        current[lastSegment] = (current[lastSegment] as string) + op.value;
      }
      break;
  }

  return tree;
}

/**
 * Check if a patch is small enough to be efficient.
 * Large patches may indicate it's better to use a snapshot.
 */
export function isPatchEfficient(
  patch: MarkdownTreePatch,
  tree: MarkdownRoot | null,
): boolean {
  if (!tree) return true;

  const patchSize = JSON.stringify(patch).length;
  const treeSize = JSON.stringify(tree).length;

  // If patch is more than 50% of tree size, snapshot might be better
  return patchSize < treeSize * 0.5;
}

/**
 * Merge multiple patches into one.
 * Useful for batching rapid updates.
 */
export function mergePatchBatch(
  patches: MarkdownTreePatch[],
): MarkdownTreePatch {
  // Simple concatenation - could be optimized to remove redundant ops
  return patches.flat();
}
