import { createModels } from '@earendil-works/pi-ai';
import { zaiProvider } from '@earendil-works/pi-ai/providers/zai';
import { assertEquals } from '@std/assert';
import { createCredentialStore } from '@work-boost/brain';

Deno.test('file credential store reads and preserves unrelated providers', async () => {
  const root = await Deno.makeTempDir({ prefix: 'work-boost-auth-' });
  const path = `${root}/auth.json`;
  await Deno.writeTextFile(
    path,
    JSON.stringify({
      zai: { type: 'api_key', key: 'zai-secret' },
      'openai-codex': {
        type: 'oauth',
        refresh: 'refresh-token',
        access: 'access-token',
        expires: Date.now() + 60_000,
      },
      unrelated: { keep: true },
    }),
  );

  const store = createCredentialStore(path);
  assertEquals((await store.read('zai'))?.type, 'api_key');
  assertEquals(
    (await store.list()).map((entry) => entry.providerId),
    ['zai', 'openai-codex'],
  );

  await store.modify('openai-codex', async (current) => ({
    ...(current as { type: 'oauth'; refresh: string; access: string; expires: number }),
    access: 'refreshed-access-token',
    expires: Date.now() + 120_000,
  }));

  const saved = JSON.parse(await Deno.readTextFile(path));
  assertEquals(saved.zai.key, 'zai-secret');
  assertEquals(saved.unrelated, { keep: true });
  assertEquals(saved['openai-codex'].access, 'refreshed-access-token');

  await store.delete('zai');
  const afterDelete = JSON.parse(await Deno.readTextFile(path));
  assertEquals(afterDelete.zai, undefined);
  assertEquals(afterDelete['openai-codex'].access, 'refreshed-access-token');

  await Deno.remove(root, { recursive: true });
});

Deno.test('provider environment keys remain a fallback when the store is empty', async () => {
  const root = await Deno.makeTempDir({ prefix: 'work-boost-auth-' });
  const models = createModels({
    credentials: createCredentialStore(`${root}/auth.json`),
    authContext: {
      env: async (name) => (name === 'ZAI_API_KEY' ? 'environment-key' : undefined),
      fileExists: async () => false,
    },
  });
  models.setProvider(zaiProvider());

  const auth = await models.getAuth('zai');
  assertEquals(auth?.auth.apiKey, 'environment-key');
  await Deno.remove(root, { recursive: true });
});

Deno.test('concurrent credential modifications are serialized', async () => {
  const root = await Deno.makeTempDir({ prefix: 'work-boost-auth-' });
  const path = `${root}/auth.json`;
  const store = createCredentialStore(path);

  await Promise.all([
    store.modify('zai', async () => ({ type: 'api_key', key: 'first' })),
    store.modify('zai', async (current) => ({
      type: 'api_key',
      key: `${(current as { key?: string } | undefined)?.key ?? 'missing'}-second`,
    })),
  ]);

  const credential = await store.read('zai');
  assertEquals(credential?.type, 'api_key');
  assertEquals((credential as { key: string }).key, 'first-second');
  await Deno.remove(root, { recursive: true });
});
