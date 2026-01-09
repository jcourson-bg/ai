'use client';

import ChatInput from '@/components/chat-input';
import { useChat } from '@ai-sdk/react';
import { renderMdxTree } from '@ai-sdk/react';
import {
  applyMdxTreePatch,
  DefaultChatTransport,
  type FinishReason,
  type MdxTree,
  type MdxTreePatch,
  UIMessage,
} from 'ai';
import { useMemo, useState } from 'react';

type MdxTreeData = { rootId: string; tree: MdxTree };
type MdxPatchData = { rootId: string; patch: MdxTreePatch };

type MyMessage = UIMessage<
  never,
  {
    mdxTree: MdxTreeData;
    mdxPatch: MdxPatchData;
  }
>;

export default function Chat() {
  const [lastFinishReason, setLastFinishReason] = useState<
    FinishReason | undefined
  >(undefined);
  const [tree, setTree] = useState<MdxTree | null>(null);

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
          setTree(prev =>
            prev != null ? applyMdxTreePatch(prev, dataPart.data.patch) : prev,
          );
        }
      },
      onFinish: ({ finishReason }) => {
        setLastFinishReason(finishReason);
      },
    });

  const rendered = useMemo(() => {
    if (tree == null) return null;

    // Web demo: uses tag names directly. In React Native, you would map 'p', 'strong', etc.
    return renderMdxTree(tree);
  }, [tree]);

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <div className="mb-6 p-3 border rounded">
        <div className="font-medium">Rendered from streamed “MDX tree”</div>
        <div className="whitespace-pre-wrap">{rendered}</div>
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
