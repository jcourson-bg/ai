import { describe, it, expect } from 'vitest';
import {
  parseMarkdownToTree,
  StreamingMarkdownParser,
} from './markdown-parser';

describe('parseMarkdownToTree', () => {
  describe('basic elements', () => {
    it('should parse plain text as a paragraph', () => {
      const result = parseMarkdownToTree('Hello, world!');

      expect(result).toEqual({
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'Hello, world!' }],
          },
        ],
      });
    });

    it('should parse headings', () => {
      const result = parseMarkdownToTree('# Heading 1\n## Heading 2');

      expect(result.children).toHaveLength(2);
      expect(result.children[0]).toEqual({
        type: 'heading',
        depth: 1,
        children: [{ type: 'text', value: 'Heading 1' }],
      });
      expect(result.children[1]).toEqual({
        type: 'heading',
        depth: 2,
        children: [{ type: 'text', value: 'Heading 2' }],
      });
    });

    it('should parse all heading levels', () => {
      const markdown = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;

      const result = parseMarkdownToTree(markdown);

      for (let i = 0; i < 6; i++) {
        expect(result.children[i]).toMatchObject({
          type: 'heading',
          depth: i + 1,
        });
      }
    });
  });

  describe('inline formatting', () => {
    it('should parse bold text with asterisks', () => {
      const result = parseMarkdownToTree('This is **bold** text');

      expect(result.children[0]).toEqual({
        type: 'paragraph',
        children: [
          { type: 'text', value: 'This is ' },
          {
            type: 'strong',
            children: [{ type: 'text', value: 'bold' }],
          },
          { type: 'text', value: ' text' },
        ],
      });
    });

    it('should parse italic text with asterisks', () => {
      const result = parseMarkdownToTree('This is *italic* text');

      expect(result.children[0]).toEqual({
        type: 'paragraph',
        children: [
          { type: 'text', value: 'This is ' },
          {
            type: 'emphasis',
            children: [{ type: 'text', value: 'italic' }],
          },
          { type: 'text', value: ' text' },
        ],
      });
    });

    it('should parse inline code', () => {
      const result = parseMarkdownToTree('Use `console.log()` for debugging');

      expect(result.children[0]).toEqual({
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Use ' },
          { type: 'inlineCode', value: 'console.log()' },
          { type: 'text', value: ' for debugging' },
        ],
      });
    });

    it('should parse strikethrough', () => {
      const result = parseMarkdownToTree('This is ~~deleted~~ text');

      expect(result.children[0]).toEqual({
        type: 'paragraph',
        children: [
          { type: 'text', value: 'This is ' },
          {
            type: 'strikethrough',
            children: [{ type: 'text', value: 'deleted' }],
          },
          { type: 'text', value: ' text' },
        ],
      });
    });

    it('should parse nested inline formatting with separate markers', () => {
      // Using separate markers **_text_** for bold-italic
      const result = parseMarkdownToTree('This is **_bold and italic_** text');

      expect(result.children[0]).toMatchObject({
        type: 'paragraph',
        children: [
          { type: 'text', value: 'This is ' },
          {
            type: 'strong',
            children: [
              {
                type: 'emphasis',
                children: [{ type: 'text', value: 'bold and italic' }],
              },
            ],
          },
          { type: 'text', value: ' text' },
        ],
      });
    });
  });

  describe('links and images', () => {
    it('should parse links', () => {
      const result = parseMarkdownToTree(
        'Visit [Google](https://google.com) for search',
      );

      expect(result.children[0]).toEqual({
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Visit ' },
          {
            type: 'link',
            url: 'https://google.com',
            title: undefined,
            children: [{ type: 'text', value: 'Google' }],
          },
          { type: 'text', value: ' for search' },
        ],
      });
    });

    it('should parse links with titles', () => {
      const result = parseMarkdownToTree(
        '[Link](https://example.com "Example Site")',
      );

      expect(result.children[0].children[0]).toMatchObject({
        type: 'link',
        url: 'https://example.com',
        title: 'Example Site',
      });
    });

    it('should parse images', () => {
      const result = parseMarkdownToTree('![Alt text](image.png "Title")');

      expect(result.children[0].children[0]).toEqual({
        type: 'image',
        url: 'image.png',
        alt: 'Alt text',
        title: 'Title',
      });
    });
  });

  describe('code blocks', () => {
    it('should parse fenced code blocks', () => {
      const markdown = `\`\`\`javascript
const x = 1;
console.log(x);
\`\`\``;

      const result = parseMarkdownToTree(markdown);

      expect(result.children[0]).toEqual({
        type: 'code',
        lang: 'javascript',
        meta: undefined,
        value: 'const x = 1;\nconsole.log(x);',
      });
    });

    it('should parse code blocks without language', () => {
      const markdown = `\`\`\`
plain code
\`\`\``;

      const result = parseMarkdownToTree(markdown);

      expect(result.children[0]).toEqual({
        type: 'code',
        lang: undefined,
        meta: undefined,
        value: 'plain code',
      });
    });

    it('should handle unclosed code blocks', () => {
      const markdown = `\`\`\`javascript
const x = 1;
// streaming...`;

      const result = parseMarkdownToTree(markdown);

      expect(result.children[0]).toMatchObject({
        type: 'code',
        lang: 'javascript',
        value: 'const x = 1;\n// streaming...',
      });
    });
  });

  describe('lists', () => {
    it('should parse unordered lists', () => {
      const markdown = `- Item 1
- Item 2
- Item 3`;

      const result = parseMarkdownToTree(markdown);

      expect(result.children[0]).toMatchObject({
        type: 'list',
        ordered: false,
        children: [
          { type: 'listItem' },
          { type: 'listItem' },
          { type: 'listItem' },
        ],
      });
    });

    it('should parse ordered lists', () => {
      const markdown = `1. First
2. Second
3. Third`;

      const result = parseMarkdownToTree(markdown);

      expect(result.children[0]).toMatchObject({
        type: 'list',
        ordered: true,
      });
    });
  });

  describe('blockquotes', () => {
    it('should parse blockquotes', () => {
      const markdown = `> This is a quote
> with multiple lines`;

      const result = parseMarkdownToTree(markdown);

      expect(result.children[0]).toMatchObject({
        type: 'blockquote',
      });
    });
  });

  describe('thematic breaks', () => {
    it('should parse horizontal rules with dashes', () => {
      const result = parseMarkdownToTree('---');

      expect(result.children[0]).toEqual({ type: 'thematicBreak' });
    });

    it('should parse horizontal rules with asterisks', () => {
      const result = parseMarkdownToTree('***');

      expect(result.children[0]).toEqual({ type: 'thematicBreak' });
    });

    it('should parse horizontal rules with underscores', () => {
      const result = parseMarkdownToTree('___');

      expect(result.children[0]).toEqual({ type: 'thematicBreak' });
    });
  });

  describe('tables', () => {
    it('should parse simple tables', () => {
      const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;

      const result = parseMarkdownToTree(markdown);

      expect(result.children[0]).toMatchObject({
        type: 'table',
        children: [{ type: 'tableRow' }, { type: 'tableRow' }],
      });
    });
  });

  describe('complex documents', () => {
    it('should parse a complex markdown document', () => {
      const markdown = `# Welcome

This is a **paragraph** with *formatting*.

## Code Example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

- Item 1
- Item 2

> A blockquote

---

The end.`;

      const result = parseMarkdownToTree(markdown);

      expect(result.children).toHaveLength(8);
      expect(result.children[0].type).toBe('heading');
      expect(result.children[1].type).toBe('paragraph');
      expect(result.children[2].type).toBe('heading');
      expect(result.children[3].type).toBe('code');
      expect(result.children[4].type).toBe('list');
      expect(result.children[5].type).toBe('blockquote');
      expect(result.children[6].type).toBe('thematicBreak');
      expect(result.children[7].type).toBe('paragraph');
    });
  });
});

describe('StreamingMarkdownParser', () => {
  it('should parse content incrementally', () => {
    const parser = new StreamingMarkdownParser();

    // First chunk
    let tree = parser.append('# Hello');
    expect(tree.children[0]).toMatchObject({
      type: 'heading',
      depth: 1,
    });

    // Second chunk
    tree = parser.append('\n\nThis is ');
    expect(tree.children).toHaveLength(2);

    // Third chunk
    tree = parser.append('**bold** text.');
    expect(tree.children[1]).toMatchObject({
      type: 'paragraph',
    });
  });

  it('should handle streaming code blocks', () => {
    const parser = new StreamingMarkdownParser();

    parser.append('```javascript\n');
    parser.append('const x = 1;\n');
    let tree = parser.append('console.log(x);');

    // Code block is still "open"
    expect(tree.children[0]).toMatchObject({
      type: 'code',
      lang: 'javascript',
    });

    // Close the code block
    tree = parser.append('\n```');
    expect(tree.children[0]).toMatchObject({
      type: 'code',
      lang: 'javascript',
      value: 'const x = 1;\nconsole.log(x);',
    });
  });

  it('should allow getting the tree without appending', () => {
    const parser = new StreamingMarkdownParser();

    parser.append('Hello');
    const tree1 = parser.getTree();
    const tree2 = parser.getTree();

    expect(tree1).toEqual(tree2);
  });

  it('should track full content', () => {
    const parser = new StreamingMarkdownParser();

    parser.append('Hello, ');
    parser.append('world!');

    expect(parser.getContent()).toBe('Hello, world!');
  });

  it('should reset properly', () => {
    const parser = new StreamingMarkdownParser();

    parser.append('Hello');
    parser.reset();

    expect(parser.getContent()).toBe('');
    expect(parser.getTree()).toEqual({ type: 'root', children: [] });
  });
});
