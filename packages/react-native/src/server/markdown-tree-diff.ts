import type {
  MarkdownNode,
  MarkdownRoot,
  MarkdownTreePatch,
  MarkdownTreePatchOp,
} from '../types';

/**
 * Creates a minimal diff between two markdown trees.
 *
 * This is optimized for streaming scenarios where the new tree is typically
 * an extension of the old tree (appending content), rather than arbitrary changes.
 *
 * The algorithm prioritizes:
 * 1. Detecting text appends (common in streaming)
 * 2. Detecting new nodes added at the end
 * 3. Minimizing patch size
 */
export function createMarkdownTreeDiff(
  oldTree: MarkdownRoot | null,
  newTree: MarkdownRoot,
): MarkdownTreePatch {
  if (!oldTree) {
    // No old tree, send the whole thing as a snapshot
    return [{ op: 'replace', path: '', value: newTree }];
  }

  const patches: MarkdownTreePatchOp[] = [];

  diffNodes(oldTree, newTree, '', patches);

  // If patches are too large, just send a snapshot
  const patchSize = JSON.stringify(patches).length;
  const snapshotSize = JSON.stringify(newTree).length;

  if (patchSize > snapshotSize * 0.8) {
    return [{ op: 'replace', path: '', value: newTree }];
  }

  return patches;
}

function diffNodes(
  oldNode: MarkdownNode,
  newNode: MarkdownNode,
  path: string,
  patches: MarkdownTreePatchOp[],
): void {
  // Different types - replace entirely
  if (oldNode.type !== newNode.type) {
    patches.push({ op: 'replace', path, value: newNode });
    return;
  }

  // Handle text nodes specially for streaming optimization
  if (oldNode.type === 'text' && newNode.type === 'text') {
    if (newNode.value.startsWith(oldNode.value)) {
      // New text is an extension of old text - use append
      const appendedText = newNode.value.slice(oldNode.value.length);
      if (appendedText.length > 0) {
        patches.push({
          op: 'append-text',
          path: `${path}/value`,
          value: appendedText,
        });
      }
    } else if (oldNode.value !== newNode.value) {
      patches.push({
        op: 'replace',
        path: `${path}/value`,
        value: newNode.value,
      });
    }
    return;
  }

  // Handle code blocks
  if (oldNode.type === 'code' && newNode.type === 'code') {
    if (oldNode.lang !== newNode.lang) {
      patches.push({
        op: 'replace',
        path: `${path}/lang`,
        value: newNode.lang,
      });
    }
    if (oldNode.meta !== newNode.meta) {
      patches.push({
        op: 'replace',
        path: `${path}/meta`,
        value: newNode.meta,
      });
    }
    if (newNode.value.startsWith(oldNode.value)) {
      const appendedText = newNode.value.slice(oldNode.value.length);
      if (appendedText.length > 0) {
        patches.push({
          op: 'append-text',
          path: `${path}/value`,
          value: appendedText,
        });
      }
    } else if (oldNode.value !== newNode.value) {
      patches.push({
        op: 'replace',
        path: `${path}/value`,
        value: newNode.value,
      });
    }
    return;
  }

  // Handle inline code
  if (oldNode.type === 'inlineCode' && newNode.type === 'inlineCode') {
    if (oldNode.value !== newNode.value) {
      patches.push({
        op: 'replace',
        path: `${path}/value`,
        value: newNode.value,
      });
    }
    return;
  }

  // Handle nodes with children
  if ('children' in oldNode && 'children' in newNode) {
    const oldChildren = oldNode.children as MarkdownNode[];
    const newChildren = newNode.children as MarkdownNode[];

    // First, diff existing children
    const minLength = Math.min(oldChildren.length, newChildren.length);
    for (let i = 0; i < minLength; i++) {
      diffNodes(
        oldChildren[i],
        newChildren[i],
        `${path}/children/${i}`,
        patches,
      );
    }

    // Handle removed children
    if (oldChildren.length > newChildren.length) {
      for (let i = oldChildren.length - 1; i >= newChildren.length; i--) {
        patches.push({ op: 'remove', path: `${path}/children/${i}` });
      }
    }

    // Handle added children
    if (newChildren.length > oldChildren.length) {
      for (let i = oldChildren.length; i < newChildren.length; i++) {
        patches.push({
          op: 'add',
          path: `${path}/children/${i}`,
          value: newChildren[i],
        });
      }
    }
  }

  // Handle other properties that might differ
  const oldObj = oldNode as unknown as { [key: string]: unknown };
  const newObj = newNode as unknown as { [key: string]: unknown };
  const oldKeys = Object.keys(oldObj).filter(
    k => k !== 'type' && k !== 'children',
  );
  const newKeys = Object.keys(newObj).filter(
    k => k !== 'type' && k !== 'children',
  );

  for (const key of new Set([...oldKeys, ...newKeys])) {
    const oldValue = oldObj[key];
    const newValue = newObj[key];

    if (oldValue !== newValue) {
      if (newValue === undefined) {
        patches.push({ op: 'remove', path: `${path}/${key}` });
      } else if (oldValue === undefined) {
        patches.push({ op: 'add', path: `${path}/${key}`, value: newValue });
      } else {
        patches.push({
          op: 'replace',
          path: `${path}/${key}`,
          value: newValue,
        });
      }
    }
  }
}

/**
 * Apply a patch to a markdown tree, returning a new tree.
 *
 * This function is immutable - it does not modify the original tree.
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

  // Navigate to the parent
  let current: AnyObject | unknown[] = tree as unknown as AnyObject;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (Array.isArray(current)) {
      current = current[parseInt(segment, 10)] as AnyObject;
    } else {
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
 * Checks if a patch is a "streaming append" pattern.
 *
 * Streaming appends are typically small patches that only add to existing
 * content rather than modifying structure. These can be applied more efficiently.
 */
export function isStreamingAppend(patch: MarkdownTreePatch): boolean {
  if (patch.length === 0) return false;

  // A streaming append typically has:
  // - Only 'append-text' operations, OR
  // - Only 'add' operations at the end of children arrays

  return patch.every(op => {
    if (op.op === 'append-text') return true;
    if (op.op === 'add' && op.path.includes('/children/')) return true;
    return false;
  });
}

/**
 * Estimate the size savings of using patches vs a full snapshot.
 */
export function estimatePatchEfficiency(
  oldTree: MarkdownRoot | null,
  newTree: MarkdownRoot,
): { patchSize: number; snapshotSize: number; savings: number } {
  const patch = createMarkdownTreeDiff(oldTree, newTree);
  const patchSize = JSON.stringify(patch).length;
  const snapshotSize = JSON.stringify(newTree).length;
  const savings = snapshotSize > 0 ? (1 - patchSize / snapshotSize) * 100 : 0;

  return { patchSize, snapshotSize, savings };
}
