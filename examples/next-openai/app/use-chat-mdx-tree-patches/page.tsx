'use client';

import ChatInput from '@/components/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage, type FinishReason } from 'ai';
import { useMemo, useState } from 'react';

type MdxLikeNode =
  | { type: 'root'; children: MdxLikeNode[] }
  | { type: 'paragraph'; children: MdxLikeNode[] }
  | { type: 'text'; value: string };

type MdxTreeData = { rootId: string; tree: MdxLikeNode };
type MdxAppendPatchData = { rootId: string; path: string; append: string };

type MyMessage = UIMessage<
  never,
  {
    mdxTree: MdxTreeData;
    mdxPatch: MdxAppendPatchData;
  }
>;

function getTextValue(tree: MdxLikeNode | null): string {
  if (
    tree?.type !== 'root' ||
    tree.children[0]?.type !== 'paragraph' ||
    tree.children[0].children[0]?.type !== 'text'
  ) {
    return '';
  }

  return tree.children[0].children[0].value;
}

function applyAppendPatch(tree: MdxLikeNode | null, patch: MdxAppendPatchData) {
  // Demo patcher: expects the server to patch the single text node.
  // In a real app, you'd implement a proper JSON Pointer patcher
  // (or jsondiffpatch/JSON Patch) and handle multiple nodes.
  if (tree == null) return tree;

  if (patch.path !== '/children/0/children/0/value') return tree;

  if (
    tree.type !== 'root' ||
    tree.children[0]?.type !== 'paragraph' ||
    tree.children[0].children[0]?.type !== 'text'
  ) {
    return tree;
  }

  const currentValue = tree.children[0].children[0].value;

  return {
    ...tree,
    children: [
      {
        ...tree.children[0],
        children: [{ type: 'text', value: currentValue + patch.append }],
      },
    ],
  } satisfies MdxLikeNode;
}

export default function Chat() {
  const [lastFinishReason, setLastFinishReason] = useState<
    FinishReason | undefined
  >(undefined);
  const [tree, setTree] = useState<MdxLikeNode | null>(null);

  const { error, status, sendMessage, messages, regenerate, stop } =
    useChat<MyMessage>({
      transport: new DefaultChatTransport({
        api: '/api/use-chat-mdx-tree-patches',
      }),
      onData: dataPart => {
        if (dataPart.type === 'data-mdxTree') {
          setTree(dataPart.data.tree);
        }

        if (dataPart.type === 'data-mdxPatch') {
          setTree(prev => applyAppendPatch(prev, dataPart.data));
        }
      },
      onFinish: ({ finishReason }) => {
        setLastFinishReason(finishReason);
      },
    });

  const treeText = useMemo(() => getTextValue(tree), [tree]);

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <div className="mb-6 p-3 border rounded">
        <div className="font-medium">Rendered from streamed “MDX tree”</div>
        <div className="whitespace-pre-wrap">{treeText}</div>
      </div>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <span key={index}>{part.text}</span>;
            }
            if (part.type === 'data-mdxTree') {
              return (
                <pre key={index} className="mt-2 text-xs opacity-70">
                  {JSON.stringify(part.data.tree, null, 2)}
                </pre>
              );
            }
            return null;
          })}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mt-4 text-gray-500">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 rounded-md border border-blue-500"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 rounded-md border border-blue-500"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-4 text-gray-500">
          Finish reason: {String(lastFinishReason)}
        </div>
      )}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
