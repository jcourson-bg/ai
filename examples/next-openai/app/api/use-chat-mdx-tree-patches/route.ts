import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from 'ai';
import type { UIMessageChunk } from 'ai';

type MdxLikeNode =
  | { type: 'root'; children: MdxLikeNode[] }
  | { type: 'paragraph'; children: MdxLikeNode[] }
  | { type: 'text'; value: string };

type MdxTreeData = { rootId: string; tree: MdxLikeNode };
type MdxAppendPatchData = {
  rootId: string;
  path: string;
  append: string;
};

const ROOT_ID = 'mdx-root';
const TEXT_VALUE_PATH = '/children/0/children/0/value';

function createInitialTree(): MdxLikeNode {
  return {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '' }],
      },
    ],
  };
}

function setTextValue(tree: MdxLikeNode, value: string): MdxLikeNode {
  if (
    tree.type !== 'root' ||
    tree.children[0]?.type !== 'paragraph' ||
    tree.children[0].children[0]?.type !== 'text'
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

          // Stream an incremental "append patch" that the client can apply to its local tree.
          // Marked as transient so it doesn't bloat message history, but still triggers onData().
          writer.write({
            type: 'data-mdxPatch',
            data: {
              rootId: ROOT_ID,
              path: TEXT_VALUE_PATH,
              append: chunk.text,
            } satisfies MdxAppendPatchData,
            transient: true,
          } satisfies UIMessageChunk<never, { mdxPatch: MdxAppendPatchData }>);
        },
        onFinish: () => {
          // Send a final snapshot for recovery / persistence.
          writer.write({
            type: 'data-mdxTree',
            id: ROOT_ID,
            data: {
              rootId: ROOT_ID,
              tree: setTextValue(createInitialTree(), fullText),
            } satisfies MdxTreeData,
          } satisfies UIMessageChunk<never, { mdxTree: MdxTreeData }>);
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
