import { describe, it, expect } from 'vitest';
import {
  applyMarkdownTreePatch,
  createMarkdownTreeDiff,
  estimatePatchEfficiency,
  isStreamingAppend,
} from './markdown-tree-diff';
import type { MarkdownRoot } from '../types';

describe('createMarkdownTreeDiff', () => {
  it('should return full snapshot for null old tree', () => {
    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const patch = createMarkdownTreeDiff(null, newTree);

    expect(patch).toHaveLength(1);
    expect(patch[0]).toEqual({
      op: 'replace',
      path: '',
      value: newTree,
    });
  });

  it('should detect text appends', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello, world!' }],
        },
      ],
    };

    const patch = createMarkdownTreeDiff(oldTree, newTree);

    expect(patch).toContainEqual({
      op: 'append-text',
      path: '/children/0/children/0/value',
      value: ', world!',
    });
  });

  it('should detect added children', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'First' }],
        },
      ],
    };

    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'First' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Second' }],
        },
      ],
    };

    const patch = createMarkdownTreeDiff(oldTree, newTree);

    expect(patch).toContainEqual({
      op: 'add',
      path: '/children/1',
      value: {
        type: 'paragraph',
        children: [{ type: 'text', value: 'Second' }],
      },
    });
  });

  it('should detect removed children', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'First' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Second' }],
        },
      ],
    };

    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'First' }],
        },
      ],
    };

    const patch = createMarkdownTreeDiff(oldTree, newTree);

    expect(patch).toContainEqual({
      op: 'remove',
      path: '/children/1',
    });
  });

  it('should detect type changes as replacements', () => {
    // Use a larger tree to ensure patch is more efficient than snapshot
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: 'First paragraph with some content to make it larger',
            },
          ],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Second paragraph' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Third paragraph to keep' }],
        },
      ],
    };

    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [
            {
              type: 'text',
              value: 'First paragraph with some content to make it larger',
            },
          ],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Second paragraph' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Third paragraph to keep' }],
        },
      ],
    };

    const patch = createMarkdownTreeDiff(oldTree, newTree);

    // Should have a replace operation for the first child that changed type
    expect(patch).toContainEqual({
      op: 'replace',
      path: '/children/0',
      value: {
        type: 'heading',
        depth: 1,
        children: [
          {
            type: 'text',
            value: 'First paragraph with some content to make it larger',
          },
        ],
      },
    });
  });

  it('should return empty patch for identical trees', () => {
    const tree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const patch = createMarkdownTreeDiff(tree, structuredClone(tree));

    expect(patch).toHaveLength(0);
  });
});

describe('applyMarkdownTreePatch', () => {
  it('should apply replace operation on root', () => {
    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'New' }],
        },
      ],
    };

    const result = applyMarkdownTreePatch(null, [
      { op: 'replace', path: '', value: newTree },
    ]);

    expect(result).toEqual(newTree);
  });

  it('should apply append-text operation', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const result = applyMarkdownTreePatch(oldTree, [
      {
        op: 'append-text',
        path: '/children/0/children/0/value',
        value: ', world!',
      },
    ]);

    expect(result.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: 'Hello, world!' }],
    });
  });

  it('should apply add operation', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'First' }],
        },
      ],
    };

    const result = applyMarkdownTreePatch(oldTree, [
      {
        op: 'add',
        path: '/children/1',
        value: {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Second' }],
        },
      },
    ]);

    expect(result.children).toHaveLength(2);
    expect(result.children[1]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: 'Second' }],
    });
  });

  it('should apply remove operation', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'First' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Second' }],
        },
      ],
    };

    const result = applyMarkdownTreePatch(oldTree, [
      { op: 'remove', path: '/children/1' },
    ]);

    expect(result.children).toHaveLength(1);
    expect(result.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: 'First' }],
    });
  });

  it('should apply multiple operations in sequence', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const result = applyMarkdownTreePatch(oldTree, [
      {
        op: 'append-text',
        path: '/children/0/children/0/value',
        value: ', world!',
      },
      {
        op: 'add',
        path: '/children/1',
        value: {
          type: 'paragraph',
          children: [{ type: 'text', value: 'New paragraph' }],
        },
      },
    ]);

    expect(result.children).toHaveLength(2);
    expect(result.children[0]).toMatchObject({
      children: [{ type: 'text', value: 'Hello, world!' }],
    });
    expect(result.children[1]).toMatchObject({
      children: [{ type: 'text', value: 'New paragraph' }],
    });
  });

  it('should create a new tree without mutating the original', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const originalValue = (oldTree.children[0] as any).children[0].value;

    applyMarkdownTreePatch(oldTree, [
      {
        op: 'append-text',
        path: '/children/0/children/0/value',
        value: ', world!',
      },
    ]);

    // Original tree should be unchanged
    expect((oldTree.children[0] as any).children[0].value).toBe(originalValue);
  });
});

describe('isStreamingAppend', () => {
  it('should return true for append-text only patches', () => {
    const patch = [
      { op: 'append-text' as const, path: '/children/0/value', value: 'more' },
    ];

    expect(isStreamingAppend(patch)).toBe(true);
  });

  it('should return true for add operations in children', () => {
    const patch = [
      { op: 'add' as const, path: '/children/1', value: { type: 'paragraph' } },
    ];

    expect(isStreamingAppend(patch)).toBe(true);
  });

  it('should return false for replace operations', () => {
    const patch = [
      {
        op: 'replace' as const,
        path: '/children/0',
        value: { type: 'paragraph' },
      },
    ];

    expect(isStreamingAppend(patch)).toBe(false);
  });

  it('should return false for remove operations', () => {
    const patch = [{ op: 'remove' as const, path: '/children/0' }];

    expect(isStreamingAppend(patch)).toBe(false);
  });

  it('should return false for empty patches', () => {
    expect(isStreamingAppend([])).toBe(false);
  });
});

describe('estimatePatchEfficiency', () => {
  it('should calculate savings correctly', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello, world!' }],
        },
      ],
    };

    const { patchSize, snapshotSize, savings } = estimatePatchEfficiency(
      oldTree,
      newTree,
    );

    expect(patchSize).toBeLessThan(snapshotSize);
    expect(savings).toBeGreaterThan(0);
  });

  it('should handle null old tree', () => {
    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };

    const { savings } = estimatePatchEfficiency(null, newTree);

    // Full snapshot, no savings
    expect(savings).toBeLessThanOrEqual(0);
  });
});

describe('round-trip diff and patch', () => {
  it('should produce identical tree after applying diff', () => {
    const oldTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: 'Title' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Some ' },
            { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
            { type: 'text', value: ' text.' },
          ],
        },
      ],
    };

    const newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: 'Title' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Some ' },
            { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
            { type: 'text', value: ' text with more content.' },
          ],
        },
        {
          type: 'code',
          lang: 'javascript',
          value: 'console.log("hello");',
        },
      ],
    };

    const patch = createMarkdownTreeDiff(oldTree, newTree);
    const result = applyMarkdownTreePatch(oldTree, patch);

    expect(result).toEqual(newTree);
  });

  it('should handle incremental streaming updates', () => {
    let currentTree: MarkdownRoot = {
      type: 'root',
      children: [],
    };

    // Simulate streaming: add heading
    let newTree: MarkdownRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: 'H' }],
        },
      ],
    };
    let patch = createMarkdownTreeDiff(currentTree, newTree);
    currentTree = applyMarkdownTreePatch(currentTree, patch);

    // Continue streaming: extend heading
    newTree = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: 'Hello' }],
        },
      ],
    };
    patch = createMarkdownTreeDiff(currentTree, newTree);
    currentTree = applyMarkdownTreePatch(currentTree, patch);

    // Add paragraph
    newTree = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: 'Hello' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'World' }],
        },
      ],
    };
    patch = createMarkdownTreeDiff(currentTree, newTree);
    currentTree = applyMarkdownTreePatch(currentTree, patch);

    expect(currentTree).toEqual(newTree);
  });
});
