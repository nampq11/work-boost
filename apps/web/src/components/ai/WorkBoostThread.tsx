import {
  ActionBarPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from '@assistant-ui/react';
import type { ThreadMessage } from '@assistant-ui/react';
import { StreamdownTextPrimitive } from '@assistant-ui/react-streamdown';
import { Copy, PaperPlaneRight, Stop } from '@phosphor-icons/react';
import React from 'react';
import { MessagePair } from './MessagePair.tsx';

function getMessageText(content: ThreadMessage['content']): string {
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function AssistantMarkdown() {
  return (
    <StreamdownTextPrimitive
      mode="streaming"
      caret="block"
      animated
      defer
      className="copilot-markdown"
    />
  );
}

function UserMessage() {
  const hasAssistantReply = useAuiState(
    (state) => state.thread.messages[state.message.index + 1]?.role === 'assistant',
  );
  if (hasAssistantReply) return null;

  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[90%] rounded-lg bg-[var(--accent-blue)] px-3 py-2 text-sm leading-relaxed text-white">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const assistantText = useAuiState((state) => getMessageText(state.message.content));
  const status = useAuiState((state) => state.message.status);
  const userMessage = useAuiState((state) => {
    const previousMessage = state.thread.messages[state.message.index - 1];
    return previousMessage?.role === 'user' ? getMessageText(previousMessage.content) : '';
  });
  const assistantContent = (
    <>
      <MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} />
      <MessagePrimitive.Error>
        <AssistantError />
      </MessagePrimitive.Error>
    </>
  );

  return (
    <MessagePrimitive.Root className="group flex flex-col items-start gap-1">
      <MessagePair
        userMessage={userMessage}
        loading={status?.type === 'running' && !assistantText}
        assistantContent={assistantContent}
        actions={
          <ActionBarPrimitive.Root className="flex items-center px-1" hideWhenRunning>
            <ActionBarPrimitive.Copy
              type="button"
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              aria-label="Copy response"
              title="Copy response"
            >
              <Copy size={13} />
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        }
      />
    </MessagePrimitive.Root>
  );
}

function AssistantError() {
  const error = useAuiState((state) => {
    const status = state.message.status;
    if (status?.type !== 'incomplete' || status.reason !== 'error') return undefined;
    return status.error;
  });
  return (
    <p className="text-sm text-[var(--accent-red)]">{String(error ?? 'The assistant failed.')}</p>
  );
}

function Welcome() {
  return (
    <ThreadPrimitive.Empty>
      <div className="px-3 py-10 text-center text-sm leading-relaxed text-[var(--text-muted)]">
        <p className="font-medium text-[var(--text-primary)]">How can I help you today?</p>
        <p className="mt-2">Summarize notes, query daily tasks, or record debt entries.</p>
      </div>
    </ThreadPrimitive.Empty>
  );
}

function Composer() {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  return (
    <ComposerPrimitive.Root className="relative border-t border-[var(--border)] bg-[var(--surface-app)] p-3">
      <ComposerPrimitive.Input
        placeholder="Ask Work Boost..."
        rows={3}
        submitMode="enter"
        className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface-hover)] p-3 pr-10 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)]"
      />
      {isRunning ? (
        <ComposerPrimitive.Cancel
          className="absolute bottom-5 right-5 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
          aria-label="Cancel request"
          title="Cancel request"
        >
          <Stop size={14} weight="fill" />
        </ComposerPrimitive.Cancel>
      ) : (
        <ComposerPrimitive.Send
          className="absolute bottom-5 right-5 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 disabled:opacity-50"
          aria-label="Send message"
          title="Send message"
        >
          <PaperPlaneRight size={14} weight="fill" />
        </ComposerPrimitive.Send>
      )}
    </ComposerPrimitive.Root>
  );
}

export function WorkBoostThread() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <Welcome />
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>
        <Composer />
      </ThreadPrimitive.Root>
    </div>
  );
}
