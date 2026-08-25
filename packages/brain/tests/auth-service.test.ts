import type {
  AuthInteraction,
  Models,
  Provider,
  ProviderAuthInteraction,
} from '@earendil-works/pi-ai';
import { assert, assertEquals, assertRejects } from '@std/assert';
import { type AuthLoginEvent, AuthService } from '@work-boost/brain';

const ai = { provider: 'openai-codex' as const, model: 'gpt-5.4-mini' };

function createModels(
  login: (
    interaction: ProviderAuthInteraction,
  ) => Promise<never | { type: 'oauth'; access: string; refresh: string; expires: number }>,
  connected = false,
): Models {
  const provider = {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    auth: { oauth: { login } },
  } as unknown as Provider;
  return {
    getProvider: () => provider,
    checkAuth: () =>
      Promise.resolve(connected ? { source: 'OAuth', type: 'oauth' as const } : undefined),
    getAuth: () =>
      connected
        ? Promise.resolve({ auth: { apiKey: 'access-token' }, source: 'OAuth' })
        : Promise.resolve(undefined),
    login: () => Promise.reject(new Error('unused')),
    logout: () => Promise.resolve(),
  } as unknown as Models;
}

Deno.test('AuthService translates device events without exposing credentials', async () => {
  const models = createModels(async (interaction) => {
    await interaction.prompt({
      type: 'select',
      message: 'Select login method',
      options: [{ id: 'device_code', label: 'Device code' }],
    });
    interaction.notify({
      type: 'device_code',
      verificationUri: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-EFGH',
      expiresInSeconds: 900,
    });
    interaction.notify({ type: 'progress', message: 'token=access-token-secret' });
    return {
      type: 'oauth',
      access: 'access-token-secret',
      refresh: 'refresh-token-secret',
      expires: Date.now() + 60_000,
    };
  });
  models.login = async (_provider, _type, interaction) => {
    const credential = await models
      .getProvider('openai-codex')!
      .auth.oauth!.login(interaction as AuthInteraction & { signal: AbortSignal });
    return credential;
  };

  const service = new AuthService({ ai, models, terminalCleanupMs: 10_000 });
  const session = await service.startLogin({ provider: ai.provider, type: 'oauth' });
  const events: AuthLoginEvent[] = [];
  service.subscribe(session.loginId, (event) => events.push(event));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(
    events.map((event) => event.type),
    ['started', 'device_code', 'progress', 'completed'],
  );
  assert(!JSON.stringify(events).includes('access-token-secret'));
  assert(!JSON.stringify(events).includes('refresh-token-secret'));
  service.dispose();
});

Deno.test('AuthService rejects concurrent login and cancellation is idempotent', async () => {
  const models = createModels(
    (interaction) =>
      new Promise((_resolve, reject) => {
        interaction.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  models.login = (_provider, _type, interaction) =>
    new Promise((_resolve, reject) => {
      interaction.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      );
    });

  const service = new AuthService({ ai, models, terminalCleanupMs: 10_000 });
  const session = await service.startLogin({ provider: ai.provider, type: 'oauth' });
  await assertRejects(
    () => service.startLogin({ provider: ai.provider, type: 'oauth' }),
    Error,
    'Another login is already in progress',
  );
  assertEquals(await service.cancelLogin(session.loginId), { status: 'cancelled' });
  assertEquals(await service.cancelLogin(session.loginId), { status: 'cancelled' });
  service.dispose();
});

Deno.test('AuthService exposes only safe connected status metadata', async () => {
  const service = new AuthService({
    ai,
    models: createModels(
      async () => ({
        type: 'oauth',
        access: 'secret',
        refresh: 'secret',
        expires: Date.now() + 60_000,
      }),
      true,
    ),
  });

  assertEquals(await service.getStatus(), {
    provider: 'openai-codex',
    model: 'gpt-5.4-mini',
    auth: { supported: true, type: 'oauth', status: 'connected', source: 'OAuth' },
  });
  service.dispose();
});

Deno.test('AuthService reports refresh_failed when auth check fails', async () => {
  const models = createModels(async () => ({
    type: 'oauth',
    access: 'secret',
    refresh: 'secret',
    expires: Date.now() + 60_000,
  }));
  models.checkAuth = () => Promise.reject(new Error('refresh failed'));
  const service = new AuthService({ ai, models });
  try {
    assertEquals((await service.getStatus()).auth, {
      supported: true,
      type: 'oauth',
      status: 'refresh_failed',
      source: 'OAuth',
    });
  } finally {
    service.dispose();
  }
});

Deno.test('AuthService reports refresh_failed when auth resolution fails', async () => {
  const models = createModels(
    async () => ({
      type: 'oauth',
      access: 'secret',
      refresh: 'secret',
      expires: Date.now() + 60_000,
    }),
    true,
  );
  models.getAuth = () => Promise.reject(new Error('OAuth refresh failed'));
  const service = new AuthService({ ai, models });
  try {
    assertEquals((await service.getStatus()).auth, {
      supported: true,
      type: 'oauth',
      status: 'refresh_failed',
      source: 'OAuth',
    });
  } finally {
    service.dispose();
  }
});
