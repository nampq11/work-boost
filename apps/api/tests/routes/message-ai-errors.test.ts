import { assertEquals } from '@std/assert';
import { AIUnavailableError } from '@work-boost/brain';
import { handleMessageSync } from '../../src/routes/message.ts';

Deno.test('AI provider failures map to a stable 503 response', async () => {
  const agent = {
    stream: () => Promise.reject(new AIUnavailableError('zai', 'glm-5.2')),
    removeSession: () => false,
  };
  const response = await handleMessageSync(
    new Request('http://localhost/api/message/sync', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
      headers: { 'content-type': 'application/json' },
    }),
    agent,
    'request-1',
  );

  assertEquals(response.status, 503);
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string; message: string };
    meta: { requestId: string; timestamp: string };
  };
  assertEquals(body.success, false);
  assertEquals(body.error, {
    code: 'AI_UNAVAILABLE',
    message: 'The AI provider is unavailable',
  });
  assertEquals(body.meta.requestId, 'request-1');
  assertEquals(Number.isNaN(Date.parse(body.meta.timestamp)), false);
});

Deno.test('sync message processing receives client cancellation', async () => {
  const controller = new AbortController();
  let agentSignal: AbortSignal | undefined;
  let resolveStreamStarted!: () => void;
  const streamStarted = new Promise<void>((resolve) => {
    resolveStreamStarted = resolve;
  });
  let resolveStream!: (response: string) => void;
  const stream = new Promise<string>((resolve) => {
    resolveStream = resolve;
  });
  const agent = {
    stream: (_message: string, options?: { signal?: AbortSignal }) => {
      agentSignal = options?.signal;
      resolveStreamStarted();
      return stream;
    },
    removeSession: () => false,
  };

  const responsePromise = handleMessageSync(
    new Request('http://localhost/api/message/sync', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    }),
    agent,
    'request-cancel',
  );

  await streamStarted;
  controller.abort();
  assertEquals(agentSignal?.aborted, true);
  resolveStream('done');
  assertEquals((await responsePromise).status, 200);
});
