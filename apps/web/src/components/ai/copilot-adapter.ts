import type {
  ChatModelAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
  ToolCallMessagePart,
} from '@assistant-ui/react';
import type { AssistantResponseEvent } from '../../lib/api-client.ts';
import { ApiError } from '../../lib/api-client.ts';
import { DataPortUnavailableError } from '../../lib/data-port.ts';
import type { DataPort } from '../../lib/data-port.ts';

export interface CopilotApiClient {
  sendMessage?: (
    message: string,
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<{ response: string; sessionId: string }>;
  createThread?: () => Promise<{ id: string }>;
  createResponse?: (
    threadId: string,
    input: string,
    signal?: AbortSignal,
  ) => Promise<{ id: string }>;
  streamResponse?: (
    responseId: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<AssistantResponseEvent>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function stringifyToolValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function toToolCallPart(
  toolCall: NonNullable<AssistantResponseEvent['response']>['toolCalls'][number],
): ToolCallMessagePart {
  const part: ToolCallMessagePart = {
    type: 'tool-call',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args: (toolCall.args ?? {}) as ToolCallMessagePart['args'],
    argsText: stringifyToolValue(toolCall.args ?? {}),
  };
  if (toolCall.status === 'completed') {
    return { ...part, result: toolCall.result, isError: toolCall.isError };
  }
  return part;
}

function appendText(content: ThreadAssistantMessagePart[], text: string): void {
  const lastPart = content.at(-1);
  if (lastPart?.type === 'text') {
    content[content.length - 1] = { ...lastPart, text: lastPart.text + text };
    return;
  }
  content.push({ type: 'text', text });
}

function applyToolCalls(
  content: ThreadAssistantMessagePart[],
  toolCalls: NonNullable<AssistantResponseEvent['response']>['toolCalls'],
): void {
  for (const toolCall of toolCalls) {
    const part = toToolCallPart(toolCall);
    const existingIndex = content.findIndex(
      (contentPart) =>
        contentPart.type === 'tool-call' && contentPart.toolCallId === part.toolCallId,
    );
    if (existingIndex === -1) content.push(part);
    else content[existingIndex] = part;
  }
}

export function getLatestUserText(messages: readonly ThreadMessage[]): string {
  const userMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!userMessage) throw new Error('No user message is available to send.');

  const text = userMessage.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
  if (!text.trim()) throw new Error('The message cannot be empty.');
  return text;
}

export function createCopilotAdapter(
  threadId: string | Promise<string> | null,
  client: CopilotApiClient,
): ChatModelAdapter {
  function run({ messages, abortSignal }: Parameters<ChatModelAdapter['run']>[0]) {
    const text = getLatestUserText(messages);
    const { createResponse, streamResponse } = client;
    if (createResponse && streamResponse) {
      return (async function* () {
        try {
          if (!threadId) {
            throw new DataPortUnavailableError();
          }
          const response = await createResponse(await threadId, text, abortSignal);
          let outputText = '';
          const content: ThreadAssistantMessagePart[] = [];
          for await (const event of streamResponse(response.id, abortSignal)) {
            if (event.delta) {
              outputText += event.delta;
              appendText(content, event.delta);
            }
            if (event.type === 'response.failed') {
              throw new ApiError(
                event.response?.error?.code ?? 'AI_UNAVAILABLE',
                event.response?.error?.message ?? 'The assistant is unavailable.',
              );
            }
            if (event.type === 'response.cancelled') {
              throw new DOMException('The response was cancelled.', 'AbortError');
            }
            if (
              event.type === 'response.completed' &&
              event.response?.outputText &&
              !event.delta &&
              !outputText
            ) {
              outputText = event.response.outputText;
              appendText(content, outputText);
            }
            if (event.response?.toolCalls) applyToolCalls(content, event.response.toolCalls);
            if (content.length > 0) yield { content: [...content] };
          }
        } catch (error) {
          if (isAbortError(error) || error instanceof ApiError) throw error;
          throw error instanceof Error ? error : new Error('The assistant is unavailable.');
        }
      })();
    }

    return (async () => {
      try {
        const { sendMessage } = client;
        if (!sendMessage) {
          throw new Error('No AI transport is configured for this session.');
        }
        if (!threadId) {
          throw new DataPortUnavailableError();
        }
        const result = await sendMessage(text, await threadId, abortSignal);
        return { content: [{ type: 'text' as const, text: result.response }] };
      } catch (error) {
        // assistant-ui treats an AbortError as cancellation. Keep ApiError intact so its
        // stable API message and code remain available to the error renderer.
        if (
          isAbortError(error) ||
          error instanceof ApiError ||
          error instanceof DataPortUnavailableError
        )
          throw error;
        throw error instanceof Error ? error : new Error('The assistant is unavailable.');
      }
    })();
  }

  return { run };
}

/** Build the CopilotApiClient from a DataPort's AI surface. */
export function dataPortToCopilotClient(port: DataPort): CopilotApiClient {
  return {
    sendMessage: (message, sessionId, signal) => port.sendMessage(message, sessionId, signal),
    createThread: () => port.createThread(),
    createResponse: (threadId, input, signal) => port.createResponse(threadId, input, signal),
    streamResponse: (responseId, signal) => port.streamResponse(responseId, signal),
  };
}
