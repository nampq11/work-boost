import { createModels } from '@earendil-works/pi-ai';
import { zaiProvider } from '@earendil-works/pi-ai/providers/zai';
import { assertEquals } from '@std/assert';
import { dirname, join } from '@std/path';
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

Deno.test('credential store recovers a lock owned by a terminated process', async () => {
  if (Deno.build.os === 'windows') return;
  const root = await Deno.makeTempDir({ prefix: 'work-boost-auth-' });
  const path = `${root}/auth.json`;
  const lockPath = `${path}.lock`;
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({ pid: 2_147_483_647, createdAt: Date.now() - 60_000 }),
  );
  const staleAt = new Date(Date.now() - 60_000);
  await Deno.utime(lockPath, staleAt, staleAt);

  await createCredentialStore(path).modify('zai', async () => ({
    type: 'api_key',
    key: 'recovered',
  }));
  assertEquals(
    ((await createCredentialStore(path).read('zai')) as { key: string }).key,
    'recovered',
  );
  await Deno.remove(root, { recursive: true });
});

Deno.test('credential store defaults to ~/.workboost/agent/auth.json', () => {
  const root = Deno.makeTempDirSync({ prefix: 'work-boost-home-' });
  const originalHome = Deno.env.get('HOME');
  const originalAuthPath = Deno.env.get('PI_AUTH_PATH');
  Deno.env.set('HOME', root);
  Deno.env.delete('PI_AUTH_PATH');
  try {
    const store = createCredentialStore();
    assertEquals(store.path, join(root, '.workboost', 'agent', 'auth.json'));
  } finally {
    if (originalHome !== undefined) Deno.env.set('HOME', originalHome);
    if (originalAuthPath !== undefined) Deno.env.set('PI_AUTH_PATH', originalAuthPath);
    else Deno.env.delete('PI_AUTH_PATH');
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test('credential store migrates the legacy ~/.pi/agent/auth.json once', async () => {
  const root = Deno.makeTempDirSync({ prefix: 'work-boost-home-' });
  const legacyPath = join(root, '.pi', 'agent', 'auth.json');
  const newPath = join(root, '.workboost', 'agent', 'auth.json');
  Deno.mkdirSync(dirname(legacyPath), { recursive: true });
  Deno.writeTextFileSync(
    legacyPath,
    JSON.stringify({ zai: { type: 'api_key', key: 'migrated-key' } }),
  );

  const originalHome = Deno.env.get('HOME');
  const originalAuthPath = Deno.env.get('PI_AUTH_PATH');
  Deno.env.set('HOME', root);
  Deno.env.delete('PI_AUTH_PATH');
  try {
    const store = createCredentialStore();
    assertEquals(store.path, newPath);
    const migrated = JSON.parse(Deno.readTextFileSync(newPath));
    assertEquals(migrated.zai.key, 'migrated-key');
    // The legacy file is left in place for other tools that share it.
    assertEquals(Deno.statSync(legacyPath).isFile, true);
    // A second store (or a later reload) does not clobber the migrated file.
    const store2 = createCredentialStore();
    assertEquals(store2.path, newPath);
    assertEquals((await store2.read('zai'))?.type, 'api_key');
  } finally {
    if (originalHome !== undefined) Deno.env.set('HOME', originalHome);
    if (originalAuthPath !== undefined) Deno.env.set('PI_AUTH_PATH', originalAuthPath);
    else Deno.env.delete('PI_AUTH_PATH');
    Deno.removeSync(root, { recursive: true });
  }
});
