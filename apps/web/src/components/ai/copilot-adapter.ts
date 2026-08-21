import type { ChatModelAdapter, ThreadMessage } from '@assistant-ui/react';
import type { AssistantResponseEvent } from '../../lib/api-client.ts';
import { api, ApiError } from '../../lib/api-client.ts';

export interface CopilotApiClient {
  sendMessage: (
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
  threadId: string | Promise<string>,
  client: CopilotApiClient = api,
): ChatModelAdapter {
  function run({ messages, abortSignal }: Parameters<ChatModelAdapter['run']>[0]) {
    const text = getLatestUserText(messages);
    const { createResponse, streamResponse } = client;
    if (createResponse && streamResponse) {
      return (async function* () {
        try {
          const response = await createResponse(await threadId, text, abortSignal);
          let outputText = '';
          for await (const event of streamResponse(response.id, abortSignal)) {
            if (event.delta) outputText += event.delta;
            if (event.type === 'response.failed') {
              throw new ApiError(
                event.response.error?.code ?? 'AI_UNAVAILABLE',
                event.response.error?.message ?? 'The assistant is unavailable.',
              );
            }
            if (event.type === 'response.cancelled') {
              throw new DOMException('The response was cancelled.', 'AbortError');
            }
            if (event.response.outputText && !event.delta) outputText = event.response.outputText;
            if (outputText) yield { content: [{ type: 'text' as const, text: outputText }] };
          }
        } catch (error) {
          if (isAbortError(error) || error instanceof ApiError) throw error;
          throw error instanceof Error ? error : new Error('The assistant is unavailable.');
        }
      })();
    }

    return (async () => {
      try {
        const result = await client.sendMessage(text, await threadId, abortSignal);
        return { content: [{ type: 'text' as const, text: result.response }] };
      } catch (error) {
        // assistant-ui treats an AbortError as cancellation. Keep ApiError intact so its
        // stable API message and code remain available to the error renderer.
        if (isAbortError(error) || error instanceof ApiError) throw error;
        throw error instanceof Error ? error : new Error('The assistant is unavailable.');
      }
    })();
  }

  return { run };
}
