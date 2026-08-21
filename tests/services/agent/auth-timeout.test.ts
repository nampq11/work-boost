import type { Models, Provider } from '@earendil-works/pi-ai';
import { assertEquals } from '@std/assert';
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
  const service = new AuthService({
    ai: { provider: 'openai-codex', model: 'gpt-5.4-mini' },
    models,
    loginTimeoutMs: 5,
    terminalCleanupMs: 10_000,
  });
  const session = await service.startLogin({ provider: 'openai-codex', type: 'oauth' });
  const events: AuthLoginEvent[] = [];
  service.subscribe(session.loginId, (event) => events.push(event));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertEquals(aborted, true);
  assertEquals(events.at(-1), {
    type: 'failed',
    code: 'AUTH_LOGIN_EXPIRED',
    message: 'Login expired. Start again.',
  });
  service.dispose();
});
