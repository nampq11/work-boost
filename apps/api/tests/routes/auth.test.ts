import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  type AIConfigPort,
  type AuthLoginEvent,
  type AuthPort,
  AuthServiceError,
} from '@work-boost/brain';
import {
  handleAuthConfig,
  handleAuthLogin,
  handleAuthLoginCancel,
  handleAuthLoginEvents,
  handleAuthLogout,
  handleAuthStatus,
} from '../../src/routes/auth.ts';

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
    saveApiKey: () => Promise.resolve(),
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

Deno.test('auth login validates request fields and maps service errors', async () => {
  const invalidBodies: unknown[] = [
    undefined,
    null,
    { provider: 123, type: 'oauth' },
    { provider: '', type: 'oauth' },
    { provider: 'openai-codex', type: 'password' },
    { provider: 'openai-codex', type: 'oauth', reauthenticate: 'yes' },
  ];

  for (const body of invalidBodies) {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      headers: { 'content-type': 'application/json' },
    });
    const response = await handleAuthLogin(request, createAuth(), 'validation-request');
    assertEquals(response.status, 400);
    assertStringIncludes(await response.text(), 'VALIDATION_ERROR');
  }

  const failingAuth: AuthPort = {
    ...createAuth(),
    startLogin: () =>
      Promise.reject(new AuthServiceError('AUTH_LOGIN_IN_PROGRESS', 'Already logging in', 409)),
  };
  const response = await handleAuthLogin(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'openai-codex', type: 'oauth' }),
      headers: { 'content-type': 'application/json' },
    }),
    failingAuth,
    'error-request',
  );
  assertEquals(response.status, 409);
  const payload = await response.json();
  assertEquals(payload.error.code, 'AUTH_LOGIN_IN_PROGRESS');
});

Deno.test('auth cancel and logout handle invalid IDs and successful logout', async () => {
  const invalidCancel = await handleAuthLoginCancel(
    createAuth(),
    'not-a-login-id',
    'cancel-request',
  );
  assertEquals(invalidCancel.status, 404);
  assertStringIncludes(await invalidCancel.text(), 'AUTH_LOGIN_NOT_FOUND');

  const logout = await handleAuthLogout(createAuth(), 'logout-request');
  assertEquals(logout.status, 200);
  assertStringIncludes(await logout.text(), 'not_connected');
});

Deno.test('auth config maps typed validation errors to 400 and storage faults to 500', async () => {
  const aiConfig: AIConfigPort = {
    setAIConfig: (input) =>
      input.provider === 'openrouter' && !input.model
        ? Promise.reject(
            new AuthServiceError(
              'AI_CONFIG_MODEL_REQUIRED',
              'AI model is required when provider "openrouter" is selected',
              400,
            ),
          )
        : Promise.reject(new Error('config write failed')),
  };
  const request = (body: Record<string, string>) =>
    new Request('http://localhost/api/auth/config', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  const invalid = await handleAuthConfig(
    aiConfig,
    request({ provider: 'openrouter' }),
    'config-validation-request',
  );
  assertEquals(invalid.status, 400);
  assertStringIncludes(await invalid.text(), 'AI_CONFIG_MODEL_REQUIRED');

  const storageFault = await handleAuthConfig(
    aiConfig,
    request({ provider: 'openai-codex', model: 'gpt-5.4-mini' }),
    'config-fault-request',
  );
  assertEquals(storageFault.status, 500);
  const payload = await storageFault.json();
  assertEquals(payload.error.code, 'INTERNAL_ERROR');
  assertEquals(payload.error.message, 'Failed to update the AI configuration');
});
