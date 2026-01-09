import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type MdxTree,
  type MdxTreePatch,
  stepCountIs,
  streamText,
} from 'ai';
import type { UIMessageChunk } from 'ai';

type MdxTreeData = { rootId: string; tree: MdxTree };
type MdxPatchData = { rootId: string; patch: MdxTreePatch };

const ROOT_ID = 'mdx-root';
const TEXT_VALUE_PATH = '/children/0/children/0/value';

function createInitialTree(): MdxTree {
  return {
    type: 'element',
    name: 'root',
    children: [
      {
        type: 'element',
        name: 'p',
        children: [{ type: 'text', value: '' }],
      },
    ],
  };
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: unknown[] };
  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      // Send an initial "document tree" snapshot.
      writer.write({
        type: 'data-mdxTree',
        id: ROOT_ID,
        data: {
          rootId: ROOT_ID,
          tree: createInitialTree(),
        } satisfies MdxTreeData,
      } satisfies UIMessageChunk<never, { mdxTree: MdxTreeData }>);

      let fullText = '';

      const result = streamText({
        model: openai('gpt-4o'),
        stopWhen: stepCountIs(1),
        messages: modelMessages,
        onChunk: ({ chunk }) => {
          if (chunk.type !== 'text-delta' || chunk.text.length === 0) {
            return;
          }

          fullText += chunk.text;

          // Stream an incremental "tree patch" that the client can apply to its local tree.
          // Marked as transient so it doesn't bloat message history, but still triggers onData().
          writer.write({
            type: 'data-mdxPatch',
            data: {
              rootId: ROOT_ID,
              patch: {
                op: 'append-text',
                path: TEXT_VALUE_PATH,
                text: chunk.text,
              } satisfies MdxTreePatch,
            } satisfies MdxPatchData,
            transient: true,
          } satisfies UIMessageChunk<never, { mdxPatch: MdxPatchData }>);
        },
        onFinish: () => {
          // Send a final snapshot for recovery / persistence.
          writer.write({
            type: 'data-mdxTree',
            id: ROOT_ID,
            data: {
              rootId: ROOT_ID,
              tree: applyTextValue(createInitialTree(), fullText),
            } satisfies MdxTreeData,
          } satisfies UIMessageChunk<never, { mdxTree: MdxTreeData }>);
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function applyTextValue(tree: MdxTree, value: string): MdxTree {
  // Demo helper: this route uses a fixed document shape with one text node.
  // Consumers should use the exported `applyMdxTreePatch` helper with JSON pointers.
  if (
    tree.type !== 'element' ||
    tree.name !== 'root' ||
    tree.children?.[0]?.type !== 'element' ||
    tree.children[0].children?.[0]?.type !== 'text'
  ) {
    return tree;
  }

  return {
    ...tree,
    children: [
      {
        ...tree.children[0],
        children: [{ type: 'text', value }],
      },
    ],
  };
}
