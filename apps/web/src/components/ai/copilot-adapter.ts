import type { ChatModelAdapter, ThreadMessage } from '@assistant-ui/react';
import { ApiError, api } from '../../lib/api-client.ts';

export interface CopilotApiClient {
  sendMessage: (
    message: string,
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<{ response: string; sessionId: string }>;
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
  sessionId: string,
  client: CopilotApiClient = api,
): ChatModelAdapter {
  return {
    async run({ messages, abortSignal }) {
      const text = getLatestUserText(messages);
      try {
        const result = await client.sendMessage(text, sessionId, abortSignal);
        return { content: [{ type: 'text', text: result.response }] };
      } catch (error) {
        // assistant-ui treats an AbortError as cancellation. Keep ApiError intact so its
        // stable API message and code remain available to the error renderer.
        if (isAbortError(error) || error instanceof ApiError) throw error;
        throw error instanceof Error ? error : new Error('The assistant is unavailable.');
      }
    },
  };
}
