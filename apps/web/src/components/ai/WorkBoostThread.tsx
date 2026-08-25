import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  unstable_useComposerInput,
  useAuiState,
} from '@assistant-ui/react';
import type { ThreadMessage, ToolCallMessagePart } from '@assistant-ui/react';
import { Copy, PaperPlaneRight, Stop } from '@phosphor-icons/react';
import React from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { AssistantMarkdown } from './AssistantMarkdown.tsx';
import { FileMentionMenu } from './FileMentionMenu.tsx';
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
  const { t } = useI18n();
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
          <ActionBarPrimitive.Root className="absolute left-0 top-full z-10 mt-1 flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-app)] px-1 opacity-0 shadow-sm transition-opacity group-hover/message:opacity-100">
            <ActionBarPrimitive.Copy
              type="button"
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              aria-label={t('thread.copyResponse')}
              title={t('thread.copyResponse')}
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
  const { t } = useI18n();
  const error = useAuiState((state) => {
    const status = state.message.status;
    if (status?.type !== 'incomplete' || status.reason !== 'error') {
      return undefined;
    }
    return status.error;
  });
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return (
    <p className="text-sm text-[var(--accent-red)]">{message || t('thread.assistantFailed')}</p>
  );
}

function Welcome() {
  const { t } = useI18n();
  return (
    <AuiIf condition={(state) => state.thread.isEmpty}>
      <div className="px-3 py-10 text-center text-sm leading-relaxed text-[var(--text-muted)]">
        <p className="font-medium text-[var(--text-primary)]">{t('thread.welcomeTitle')}</p>
        <p className="mt-2">{t('thread.welcomeSubtitle')}</p>
      </div>
    </AuiIf>
  );
}

function CopilotComposer() {
  const { t } = useI18n();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const { value, setText } = unstable_useComposerInput();

  return (
    <ComposerPrimitive.Root className="copilot-composer">
      <FileMentionMenu value={value} onApply={setText} containerClass=".copilot-composer" />
      <ComposerPrimitive.Input
        placeholder={t('thread.messagePlaceholder')}
        rows={1}
        submitMode="enter"
        className="copilot-composer-input"
      />
      <div className="copilot-composer-footer">
        {isRunning ? (
          <ComposerPrimitive.Cancel
            className="copilot-composer-send copilot-composer-stop"
            aria-label={t('thread.cancelRequest')}
            title={t('thread.cancelRequest')}
          >
            <Stop size={13} weight="fill" />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send
            className="copilot-composer-send"
            aria-label={t('thread.sendMessage')}
            title={t('thread.sendMessage')}
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
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
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
