import type { Models, Provider } from '@earendil-works/pi-ai';
import { assertEquals } from '@std/assert';
import { FakeTime } from '@std/testing/time';
import { type AuthLoginEvent, AuthService } from '@work-boost/brain';

Deno.test('AuthService expires a login and aborts the provider flow', async () => {
  let aborted = false;
  const provider = {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    auth: { oauth: { login: () => new Promise<never>(() => undefined) } },
  } as unknown as Provider;
  const models = {
    getProvider: () => provider,
    checkAuth: () => Promise.resolve(undefined),
    getAuth: () => Promise.resolve(undefined),
    login: (_provider: string, _type: 'oauth', interaction: { signal?: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        interaction.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
    logout: () => Promise.resolve(),
  } as unknown as Models;
  const time = new FakeTime();
  const service = new AuthService({
    ai: { provider: 'openai-codex', model: 'gpt-5.4-mini' },
    models,
    loginTimeoutMs: 5,
    terminalCleanupMs: 10_000,
  });
  try {
    const session = await service.startLogin({ provider: 'openai-codex', type: 'oauth' });
    const events: AuthLoginEvent[] = [];
    service.subscribe(session.loginId, (event) => events.push(event));
    time.tick(6);
    await Promise.resolve();

    assertEquals(aborted, true);
    assertEquals(events.at(-1), {
      type: 'failed',
      code: 'AUTH_LOGIN_EXPIRED',
      message: 'Login expired. Start again.',
    });
  } finally {
    service.dispose();
    time.restore();
  }
});
