import type { ChatModelRunOptions, ThreadMessage } from '@assistant-ui/react';
/// <reference lib="deno.ns" />
import { assertEquals, assertRejects } from '@std/assert';
import { ApiError } from '../../lib/api-client.ts';
import { createCopilotAdapter, getLatestUserText } from './copilot-adapter.ts';

const userMessage = (text: string): ThreadMessage =>
  ({
    id: crypto.randomUUID(),
    role: 'user',
    createdAt: new Date(),
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
  }) as ThreadMessage;

const runOptions = (
  messages: readonly ThreadMessage[],
  abortSignal: AbortSignal,
): ChatModelRunOptions => ({ messages, abortSignal }) as ChatModelRunOptions;

Deno.test('copilot adapter sends only the latest user turn and preserves the session', async () => {
  const calls: { message: string; sessionId: string; signal?: AbortSignal }[] = [];
  const adapter = createCopilotAdapter('page-session', {
    sendMessage: async (message, sessionId, signal) => {
      calls.push({ message, sessionId, signal });
      return { response: '# Result', sessionId };
    },
  });
  const abortController = new AbortController();

  const result = await adapter.run(
    runOptions([userMessage('first'), userMessage('latest')], abortController.signal),
  );

  assertEquals(calls, [
    { message: 'latest', sessionId: 'page-session', signal: abortController.signal },
  ]);
  assertEquals(result, { content: [{ type: 'text', text: '# Result' }] });
});

Deno.test('copilot adapter rethrows API errors instead of creating assistant messages', async () => {
  const error = new ApiError('AI_UNAVAILABLE', 'The AI provider is unavailable');
  const adapter = createCopilotAdapter('page-session', {
    sendMessage: () => Promise.reject(error),
  });

  const received = await assertRejects(async () => {
    await adapter.run(runOptions([userMessage('hello')], new AbortController().signal));
  });
  assertEquals(received, error);
});

Deno.test('latest user text rejects an empty turn', async () => {
  await assertRejects(async () => getLatestUserText([userMessage('  ')]));
});

Deno.test('copilot adapter propagates cancellation errors unchanged', async () => {
  const abortError = new DOMException('Aborted', 'AbortError');
  const adapter = createCopilotAdapter('page-session', {
    sendMessage: () => Promise.reject(abortError),
  });

  const received = await assertRejects(async () => {
    await adapter.run(runOptions([userMessage('hello')], new AbortController().signal));
  });
  assertEquals(received, abortError);
});
