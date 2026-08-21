import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from '@assistant-ui/react';
import type { ThreadMessage, ToolCallMessagePart } from '@assistant-ui/react';
import { Copy, PaperPlaneRight, Stop } from '@phosphor-icons/react';
import React from 'react';
import { AssistantMarkdown } from './AssistantMarkdown.tsx';
import { MessagePair } from './MessagePair.tsx';
import { ToolTimeline } from './ToolCall.tsx';

function getMessageText(content: ThreadMessage['content']): string {
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function UserMessage() {
  const hasAssistantReply = useAuiState(
    (state) => state.thread.messages[state.message.index + 1]?.role === 'assistant',
  );
  if (hasAssistantReply) {
    return null;
  }

  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[90%] rounded-lg bg-[var(--accent-blue)] px-3 py-2 text-sm leading-relaxed text-white">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function MessagePart({
  part,
  firstToolCallId,
  toolCalls,
  isMessageRunning,
}: {
  part: ThreadMessage['content'][number];
  firstToolCallId: string | undefined;
  toolCalls: ToolCallMessagePart[];
  isMessageRunning: boolean;
}) {
  if (part.type === 'text') {
    return <AssistantMarkdown content={part.text} />;
  }
  if (part.type === 'tool-call' && part.toolCallId === firstToolCallId) {
    return <ToolTimeline parts={toolCalls} isMessageRunning={isMessageRunning} />;
  }
  return null;
}

function AssistantMessage() {
  const messageContent = useAuiState((state) => state.message.content);
  const assistantText = getMessageText(messageContent);
  const hasToolCall = messageContent.some((part) => part.type === 'tool-call');
  const toolCalls = messageContent.filter(
    (part): part is ToolCallMessagePart => part.type === 'tool-call',
  );
  const firstToolCallId = toolCalls[0]?.toolCallId;
  const status = useAuiState((state) => state.message.status);
  const isMessageRunning = status?.type === 'running';
  const userMessage = useAuiState((state) => {
    const previousMessage = state.thread.messages[state.message.index - 1];
    return previousMessage?.role === 'user' ? getMessageText(previousMessage.content) : '';
  });

  return (
    <MessagePrimitive.Root className="group flex flex-col items-start gap-1">
      <MessagePair
        userMessage={userMessage}
        loading={isMessageRunning && !assistantText && !hasToolCall}
        assistantContent={
          <>
            <MessagePrimitive.Parts>
              {({ part }) => (
                <MessagePart
                  part={part}
                  firstToolCallId={firstToolCallId}
                  toolCalls={toolCalls}
                  isMessageRunning={isMessageRunning}
                />
              )}
            </MessagePrimitive.Parts>
            <MessagePrimitive.Error>
              <AssistantError />
            </MessagePrimitive.Error>
          </>
        }
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
    if (status?.type !== 'incomplete' || status.reason !== 'error') {
      return undefined;
    }
    return status.error;
  });
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return <p className="text-sm text-[var(--accent-red)]">{message || 'The assistant failed.'}</p>;
}

function Welcome() {
  return (
    <AuiIf condition={(state) => state.thread.isEmpty}>
      <div className="px-3 py-10 text-center text-sm leading-relaxed text-[var(--text-muted)]">
        <p className="font-medium text-[var(--text-primary)]">How can I help you today?</p>
        <p className="mt-2">Summarize notes, query daily tasks, or record debt entries.</p>
      </div>
    </AuiIf>
  );
}

function CopilotComposer() {
  const isRunning = useAuiState((state) => state.thread.isRunning);

  return (
    <ComposerPrimitive.Root className="copilot-composer">
      <ComposerPrimitive.Input
        placeholder="Message Work Boost, @ to include context, / for commands"
        rows={1}
        submitMode="enter"
        className="copilot-composer-input"
      />
      <div className="copilot-composer-footer">
        {isRunning ? (
          <ComposerPrimitive.Cancel
            className="copilot-composer-send copilot-composer-stop"
            aria-label="Cancel request"
            title="Cancel request"
          >
            <Stop size={13} weight="fill" />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send
            className="copilot-composer-send"
            aria-label="Send message"
            title="Send message"
          >
            <PaperPlaneRight size={13} weight="fill" />
          </ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  );
}

export function WorkBoostThread() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <Welcome />
          <ThreadPrimitive.Messages>
            {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        <CopilotComposer />
      </ThreadPrimitive.Root>
    </div>
  );
}
