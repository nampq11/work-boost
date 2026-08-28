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
    getProviders: () => [provider as unknown as Provider],
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
    providers: [
      { id: 'openai-codex', name: 'OpenAI Codex', methods: ['oauth'], requiresModel: false },
    ],
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

function createApiKeyModels(initial?: { apiKey?: string }) {
  let storedKey = initial?.apiKey;
  const provider = {
    id: 'google',
    name: 'Google',
    auth: {
      apiKey: {
        name: 'Gemini API key',
        login: async (interaction: ProviderAuthInteraction) => {
          const key = await interaction.prompt({ type: 'secret', message: 'key' });
          storedKey = key;
          return { type: 'api_key' as const, key };
        },
      },
    },
  } as unknown as Provider;
  return {
    getProvider: (id: string) => (id === 'google' ? provider : undefined),
    getProviders: () => [provider],
    checkAuth: () =>
      Promise.resolve(
        storedKey ? { source: 'GEMINI_API_KEY', type: 'api_key' as const } : undefined,
      ),
    getAuth: () =>
      Promise.resolve(
        storedKey ? { auth: { apiKey: storedKey }, source: 'GEMINI_API_KEY' } : undefined,
      ),
    login: (_provider: string, _type: string, interaction: ProviderAuthInteraction) =>
      provider.auth.apiKey!.login!(interaction),
    logout: () => Promise.resolve(),
  } as unknown as Models;
}

Deno.test('AuthService reports api_key status for a key-only provider', async () => {
  const notConnected = new AuthService({
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
    models: createApiKeyModels(),
  });
  try {
    assertEquals((await notConnected.getStatus()).auth, {
      supported: true,
      type: 'api_key',
      status: 'not_connected',
    });
  } finally {
    notConnected.dispose();
  }

  const connected = new AuthService({
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
    models: createApiKeyModels({ apiKey: 'the-key' }),
  });
  try {
    assertEquals((await connected.getStatus()).auth, {
      supported: true,
      type: 'api_key',
      status: 'connected',
      source: 'GEMINI_API_KEY',
    });
  } finally {
    connected.dispose();
  }
});

Deno.test('AuthService saveApiKey stores an API key via the provider login', async () => {
  const models = createApiKeyModels();
  const service = new AuthService({
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
    models,
  });
  try {
    await service.saveApiKey('google', '  sk-secret-key  ');
    assertEquals((await service.getStatus()).auth, {
      supported: true,
      type: 'api_key',
      status: 'connected',
      source: 'GEMINI_API_KEY',
    });
  } finally {
    service.dispose();
  }
});

Deno.test('AuthService saveApiKey rejects empty keys and unsupported providers', async () => {
  const service = new AuthService({
    ai: { provider: 'google', model: 'gemini-2.5-flash' },
    models: createApiKeyModels(),
  });
  try {
    await assertRejects(() => service.saveApiKey('google', '   '), Error, 'An API key is required');
    await assertRejects(
      () => service.saveApiKey('openai-codex', 'key'),
      Error,
      'does not support API key login',
    );
  } finally {
    service.dispose();
  }
});
Deno.test('AuthService emits manual_code and resolves it via submitLoginCode', async () => {
  const models = createModels(async (interaction) => {
    await interaction.prompt({
      type: 'manual_code',
      message: 'Complete sign-in in your browser, or paste the redirect URL here:',
      placeholder: 'http://127.0.0.1:9999/oauth/callback/uuid',
    });
    interaction.notify({ type: 'progress', message: 'Exchanging authorization code...' });
    return {
      type: 'oauth',
      access: 'access-token-secret',
      refresh: 'refresh-token-secret',
      expires: Date.now() + 60_000,
    };
  });
  models.login = async (_provider, _type, interaction) =>
    models
      .getProvider(ai.provider)!
      .auth.oauth!.login(interaction as AuthInteraction & { signal: AbortSignal });

  const service = new AuthService({ ai, models, terminalCleanupMs: 10_000 });
  try {
    const session = await service.startLogin({ provider: ai.provider, type: 'oauth' });
    const events: AuthLoginEvent[] = [];
    service.subscribe(session.loginId, (event) => events.push(event));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A manual_code prompt is surfaced, but nothing has resolved yet.
    assert(events.some((event) => event.type === 'manual_code'));
    assert(!events.some((event) => event.type === 'completed'));

    // Submitting the redirect URL resolves the prompt and completes the login.
    await service.submitLoginCode(
      session.loginId,
      'http://127.0.0.1:9999/oauth/callback/uuid?code=stub',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(events.some((event) => event.type === 'completed'));
    assert(!JSON.stringify(events).includes('access-token-secret'));
    assert(!JSON.stringify(events).includes('refresh-token-secret'));
  } finally {
    service.dispose();
  }
});

Deno.test('AuthService submitLoginCode rejects empty input and stale prompts', async () => {
  const models = createModels(async (interaction) => {
    await interaction.prompt({
      type: 'manual_code',
      message: 'Paste the code',
    });
    interaction.notify({ type: 'progress', message: 'Exchanging...' });
    return {
      type: 'oauth',
      access: 'access-token-secret',
      refresh: 'refresh-token-secret',
      expires: Date.now() + 60_000,
    };
  });
  models.login = async (_provider, _type, interaction) =>
    models
      .getProvider(ai.provider)!
      .auth.oauth!.login(interaction as AuthInteraction & { signal: AbortSignal });

  const service = new AuthService({ ai, models, terminalCleanupMs: 10_000 });
  try {
    const session = await service.startLogin({ provider: ai.provider, type: 'oauth' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Empty / whitespace-only codes are rejected; the pending prompt survives.
    await assertRejects(
      () => service.submitLoginCode(session.loginId, '   '),
      Error,
      'An authorization code or redirect URL is required',
    );

    // Resolving with a real value completes the login, so a later submission is stale.
    await service.submitLoginCode(session.loginId, 'stub');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await assertRejects(
      () => service.submitLoginCode(session.loginId, 'stub2'),
      Error,
      'Login session was not found',
    );
  } finally {
    service.dispose();
  }
});
