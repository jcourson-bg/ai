import { describe, expect, it } from 'vitest';
import { applyMdxTreePatch, type MdxTree } from './mdx-tree';

describe('mdx-tree', () => {
  it('append-text updates a nested string value', () => {
    const tree: MdxTree = {
      type: 'element',
      name: 'root',
      children: [
        {
          type: 'element',
          name: 'p',
          children: [{ type: 'text', value: 'hi' }],
        },
      ],
    };

    const updated = applyMdxTreePatch(tree, {
      op: 'append-text',
      path: '/children/0/children/0/value',
      text: ' there',
    });

    expect(updated).toEqual({
      type: 'element',
      name: 'root',
      children: [
        {
          type: 'element',
          name: 'p',
          children: [{ type: 'text', value: 'hi there' }],
        },
      ],
    });
  });

  it('replace can replace the root', () => {
    const tree: MdxTree = { type: 'text', value: 'a' };
    const updated = applyMdxTreePatch(tree, {
      op: 'replace',
      path: '',
      value: { type: 'text', value: 'b' },
    });

    expect(updated).toEqual({ type: 'text', value: 'b' });
  });
});
