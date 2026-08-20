import { assertEquals } from '@std/assert';
import { createWorkspaceRouter } from '@work-boost/api/routes/workspace.ts';
import { createDataLayer } from '@work-boost/data-provider';

const info = {
  remote: { hostname: '127.0.0.1', port: 0, transport: 'tcp' },
} as unknown as Deno.ServeHandlerInfo;

async function withWorkspace(
  run: (
    root: string,
    handle: (path: string, init?: RequestInit) => Promise<Response>,
  ) => Promise<void>,
) {
  const root = await Deno.makeTempDir({ prefix: 'work-boost-phase4-' });
  const dataLayer = createDataLayer(root);
  await dataLayer.fs.init();
  await dataLayer.config.load();
  const router = createWorkspaceRouter({ dataLayer, apiPrefix: '/api' });
  const handle = (path: string, init?: RequestInit) =>
    router.handle(new Request(`http://localhost${path}`, init), info);
  try {
    await run(root, handle);
  } finally {
    router.stop();
    await Deno.remove(root, { recursive: true });
  }
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

Deno.test('workspace shell can trash and restore a file', async () => {
  await withWorkspace(async (_root, handle) => {
    await handle('/api/workspace/fs/write', {
      method: 'POST',
      body: JSON.stringify({
        path: 'daily/undo.md',
        content: 'draft',
        frontmatter: { custom: 'keep' },
      }),
    });
    const deleted = await json(
      await handle('/api/workspace/fs/delete?path=daily%2Fundo.md', { method: 'DELETE' }),
    );
    const trashId = (deleted.data as { trashId: string }).trashId;
    assertEquals((await handle('/api/workspace/fs/read?path=daily%2Fundo.md')).status, 404);
    const restored = await json(
      await handle('/api/workspace/fs/restore', {
        method: 'POST',
        body: JSON.stringify({ trashId }),
      }),
    );
    assertEquals((restored.data as { body: string }).body, 'draft');
    assertEquals((restored.data as { frontmatter: { custom: string } }).frontmatter.custom, 'keep');
  });
});

Deno.test('workspace shell rejects a stale conditional write', async () => {
  await withWorkspace(async (_root, handle) => {
    const created = await json(
      await handle('/api/workspace/fs/write', {
        method: 'POST',
        body: JSON.stringify({ path: 'note.md', content: 'first' }),
      }),
    );
    const modifiedAt = (created.data as { modifiedAt: string }).modifiedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await handle('/api/workspace/fs/write', {
      method: 'POST',
      body: JSON.stringify({ path: 'note.md', content: 'second' }),
    });
    const stale = await handle('/api/workspace/fs/write', {
      method: 'POST',
      body: JSON.stringify({ path: 'note.md', content: 'lost', expectedModifiedAt: modifiedAt }),
    });
    assertEquals(stale.status, 409);
    const payload = await json(stale);
    assertEquals((payload.error as { code: string }).code, 'CONFLICT');
  });
});

Deno.test('workspace trash transitions remain recoverable when metadata cleanup fails', async () => {
  const root = await Deno.makeTempDir({ prefix: 'work-boost-trash-fault-' });
  const dataLayer = createDataLayer(root);
  await dataLayer.fs.init();
  await dataLayer.config.load();
  await dataLayer.fs.writeTextAtomic('fault.md', 'content');

  const originalFs = dataLayer.fs;
  let failMetadataWrite = false;
  let failMetadataRemove = false;
  dataLayer.fs = {
    ...originalFs,
    writeTextAtomic: async (path, content) => {
      if (failMetadataWrite && path.endsWith('.json') && !path.endsWith('.journal.json')) {
        throw new Error('injected metadata write failure');
      }
      await originalFs.writeTextAtomic(path, content);
    },
    remove: async (path) => {
      if (failMetadataRemove && path.endsWith('.json') && !path.endsWith('.journal.json')) {
        throw new Error('injected metadata removal failure');
      }
      await originalFs.remove(path);
    },
  };
  const router = createWorkspaceRouter({ dataLayer, apiPrefix: '/api' });
  const handle = (path: string, init?: RequestInit) =>
    router.handle(new Request(`http://localhost${path}`, init), info);

  try {
    failMetadataWrite = true;
    const failedDelete = await handle('/api/workspace/fs/delete?path=fault.md', {
      method: 'DELETE',
    });
    assertEquals(failedDelete.status, 500);
    assertEquals(await originalFs.exists('fault.md'), true);

    failMetadataWrite = false;
    const deleted = await json(
      await handle('/api/workspace/fs/delete?path=fault.md', { method: 'DELETE' }),
    );
    const trashId = (deleted.data as { trashId: string }).trashId;
    failMetadataRemove = true;
    const failedRestore = await handle('/api/workspace/fs/restore', {
      method: 'POST',
      body: JSON.stringify({ trashId }),
    });
    assertEquals(failedRestore.status, 409);
    assertEquals(await originalFs.exists('fault.md'), false);

    failMetadataRemove = false;
    const restored = await handle('/api/workspace/fs/restore', {
      method: 'POST',
      body: JSON.stringify({ trashId }),
    });
    assertEquals(restored.status, 200);
    assertEquals(await originalFs.readText('fault.md'), 'content');
  } finally {
    router.stop();
    await Deno.remove(root, { recursive: true });
  }
});
