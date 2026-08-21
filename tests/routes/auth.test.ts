import { assertEquals, assertStringIncludes } from '@std/assert';
import type { AuthLoginEvent, AuthPort } from '@work-boost/brain';
import {
  handleAuthLogin,
  handleAuthLoginEvents,
  handleAuthStatus,
} from '../../apps/api/src/routes/auth.ts';

const loginId = '123e4567-e89b-12d3-a456-426614174000';

function createAuth(): AuthPort {
  const events: AuthLoginEvent[] = [
    { type: 'started', provider: 'openai-codex', authType: 'oauth' },
    {
      type: 'device_code',
      verificationUri: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-EFGH',
    },
    { type: 'completed', provider: 'openai-codex', status: 'connected' },
  ];
  return {
    getStatus: () =>
      Promise.resolve({
        provider: 'openai-codex',
        model: 'gpt-5.4-mini',
        auth: { supported: true, type: 'oauth', status: 'not_connected' as const },
      }),
    startLogin: () =>
      Promise.resolve({
        loginId,
        provider: 'openai-codex',
        type: 'oauth' as const,
        status: 'running' as const,
        eventsUrl: `/api/auth/login/${loginId}/events`,
        expiresAt: '2026-08-21T00:10:00.000Z',
      }),
    hasLogin: (candidate) => candidate === loginId,
    subscribe: (_candidate, listener) => {
      for (const event of events) listener(event);
      return () => undefined;
    },
    disconnect: () => undefined,
    cancelLogin: () => Promise.resolve({ status: 'cancelled' as const }),
    logout: () => Promise.resolve({ provider: 'openai-codex', status: 'not_connected' as const }),
  };
}

Deno.test('auth status and login responses are no-store envelopes', async () => {
  const auth = createAuth();
  const status = await handleAuthStatus(auth, 'status-request');
  assertEquals(status.headers.get('Cache-Control'), 'no-store');
  assertEquals(status.status, 200);
  assertStringIncludes(await status.text(), 'not_connected');

  const login = await handleAuthLogin(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'openai-codex', type: 'oauth' }),
      headers: { 'content-type': 'application/json' },
    }),
    auth,
    'login-request',
  );
  assertEquals(login.status, 202);
  assertEquals(login.headers.get('Cache-Control'), 'no-store');
  const serialized = await login.text();
  assertStringIncludes(serialized, loginId);
  assertEquals(serialized.includes('access-token'), false);
});

Deno.test('auth SSE returns ordered safe events and rejects unknown IDs', async () => {
  const auth = createAuth();
  const response = handleAuthLoginEvents(
    new Request(`http://localhost/api/auth/login/${loginId}/events`),
    auth,
    loginId,
    'sse-request',
  );
  const body = await response.text();
  assertEquals(response.headers.get('cache-control'), 'no-store');
  assertStringIncludes(body, 'event: started');
  assertStringIncludes(body, 'event: device_code');
  assertStringIncludes(body, 'event: completed');
  assertEquals(body.indexOf('event: started') < body.indexOf('event: completed'), true);

  const missing = handleAuthLoginEvents(
    new Request('http://localhost/api/auth/login/nope/events'),
    auth,
    'nope',
    'missing-request',
  );
  assertEquals(missing.status, 404);
  assertStringIncludes(await missing.text(), 'AUTH_LOGIN_NOT_FOUND');
});
