import { assertEquals } from '@std/assert';
import { AIUnavailableError } from '@work-boost/brain';
import { handleMessageSync } from '../../apps/api/src/routes/message.ts';

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
