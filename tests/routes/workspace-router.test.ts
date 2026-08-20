import { assert, assertEquals } from '@std/assert';
import { createWorkspaceRouter } from '@work-boost/api/routes/workspace.ts';
import { createDataLayer } from '@work-boost/data-provider';
import type { DataLayer } from '@work-boost/data-provider';
import { seedHtmlApps } from '@work-boost/runtime';

const API_PREFIX = '/api';
const WORKSPACE = (p: string) => `http://localhost${p}`;

interface LoopbackInfo {
  remote: { hostname: string; port: number; transport: 'tcp' };
}

function loopbackInfo(hostname = '127.0.0.1'): LoopbackInfo {
  return { remote: { hostname, port: 0, transport: 'tcp' } };
}

// A debt frontmatter + body with one pending debt. `id` defaults to a real UUID
// because DebtFrontmatterSchema enforces uuid format.
const pendingDebt = (
  direction: string,
  amount: number,
  currency: string,
  personName: string,
  id: string = crypto.randomUUID(),
) =>
  `---
id: ${id}
direction: ${direction}
amount: ${amount}
currency: ${currency}
personName: ${personName}
status: pending
debtDate: '2025-01-01'
createdAt: '2025-01-01T00:00:00.000Z'
updatedAt: '2025-01-01T00:00:00.000Z'
paidAt: null
updatedBy: agent
---

${personName} nợ ${direction === 'lent' ? 'cho' : 'từ'} tôi.
`;

async function json(res: Response) {
  return await res.json();
}

async function bodyText(res: Response) {
  return await res.text();
}

async function withTempWorkspace(
  fn: (deps: { dataLayer: DataLayer; fs: DataLayer['fs']; workspaceRoot: string }) => Promise<void>,
) {
  const tempRoot = await Deno.makeTempDir({ prefix: 'work-boost-ws-router-' });
  try {
    const dataLayer = createDataLayer(tempRoot);
    await dataLayer.fs.init();
    // config.load() is required so /api/workspace/time works and the debts repo is usable
    await dataLayer.config.load();
    await seedHtmlApps(dataLayer.fs);
    await fn({ dataLayer, fs: dataLayer.fs, workspaceRoot: tempRoot });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
}

function routerFor(dataLayer: DataLayer) {
  const router = createWorkspaceRouter({ dataLayer, apiPrefix: API_PREFIX });
  return async (pathname: string, init?: RequestInit, info?: LoopbackInfo) => {
    const url = WORKSPACE(pathname);
    const req = new Request(url, init);
    return await router.handle(req, info as unknown as Deno.ServeHandlerInfo);
  };
}

Deno.test('Workspace router - serves a seeded HTML app with CSP + injected runtime', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);

    const res = await handle('/workspace-apps/debt-tracker.html', undefined, loopbackInfo());

    assertEquals(res.status, 200);
    assertEquals(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assertEquals(
      res.headers.get('content-security-policy'),
      "sandbox allow-scripts allow-forms allow-same-origin; default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    assertEquals(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
    const text = await bodyText(res);
    assertEquals(text.includes('cdn.tailwindcss.com/3.4.17'), true);
    assertEquals(text.includes('cdn.jsdelivr.net/npm/alpinejs@3.16.2'), true);
    assertEquals(text.includes('window.workboost'), true);
    assertEquals(text.includes('Sổ Nợ Work Boost'), true);
  });
});

Deno.test('Workspace router - injects the configured API prefix into the broker runtime', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const router = createWorkspaceRouter({ dataLayer, apiPrefix: '/custom' });
    const res = await router.handle(
      new Request('http://localhost/workspace-apps/debt-tracker.html'),
      loopbackInfo() as unknown as Deno.ServeHandlerInfo,
    );
    const text = await res.text();
    assertEquals(text.includes('window.__WORKBOOST_API_BASE__="/custom/workspace"'), true);
    router.stop();
  });
});

Deno.test('Workspace router - returns 404 for missing HTML app', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle('/workspace-apps/does-not-exist.html', undefined, loopbackInfo());
    assertEquals(res.status, 404);
  });
});

Deno.test('Workspace router - blocks path traversal', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);

    // Browsers normalise '..' in the URL path, so the request lands on a route
    // the router does not serve. Encoded traversal is rejected by the fs layer.
    const res = await handle('/workspace-apps/../../etc/passwd', undefined, loopbackInfo());
    assert([403, 404].includes(res.status), `expected blocked (403/404), got ${res.status}`);
    assertEquals((await bodyText(res)).includes('root:'), false);

    const encodedRes = await handle(
      `/api/workspace/fs/read?path=${encodeURIComponent('../../etc/passwd')}`,
      undefined,
      loopbackInfo(),
    );
    assertEquals(encodedRes.status, 403);
  });
});

Deno.test('Workspace router - blocks non-loopback (localhost guard)', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle('/api/workspace/time', undefined, loopbackInfo('192.168.1.5'));
    assertEquals(res.status, 403);
    const payload = await json(res);
    assertEquals(payload.success, false);
    assertEquals(payload.error?.code, 'FORBIDDEN');
  });
});

Deno.test('Workspace router - allows remote 127.0.0.1 and ::1', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    for (const host of ['127.0.0.1', '::1', 'localhost']) {
      const res = await handle('/api/workspace/time', undefined, loopbackInfo(host));
      assertEquals(res.status, 200, `expected 200 for ${host}`);
    }
  });
});

Deno.test('Workspace router - GET /api/workspace/time uses workspace timezone (FR-07)', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle('/api/workspace/time', undefined, loopbackInfo());
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.success, true);
    assertEquals(payload.data.timezone, 'Asia/Ho_Chi_Minh');
    assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(payload.data.currentDate), true);
  });
});

Deno.test('Workspace router - fs read splits frontmatter and body', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const path = 'daily/2025-02-03.md';
    await dataLayer.fs.writeTextAtomic(
      path,
      pendingDebt('lent', 200000, 'VND', 'Nam', 'd-fs-read'),
    );

    const res = await handle(
      `/api/workspace/fs/read?path=${encodeURIComponent(path)}`,
      undefined,
      loopbackInfo(),
    );
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.success, true);
    assertEquals(payload.data.path, path);
    assertEquals(payload.data.frontmatter.currency, 'VND');
    assertEquals(payload.data.body, 'Nam nợ cho tôi.');
    assertEquals(typeof payload.data.size, 'number');
    assertEquals(typeof payload.data.modifiedAt, 'string');
  });
});

Deno.test('Workspace router - fs read blocks sensitive paths (.env, .git, .workboost/config.json)', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);

    await Deno.writeTextFile(dataLayer.fs.root + '/.env', 'SECRET=leaked');
    const checks = [
      '../../.env',
      '../../etc/passwd',
      '.env',
      '.git/config',
      '.workboost/config.json',
    ];
    for (const path of checks) {
      const res = await handle(
        `/api/workspace/fs/read?path=${encodeURIComponent(path)}`,
        undefined,
        loopbackInfo(),
      );
      assertEquals(res.status, 403, `expected 403 for ${path}`);
    }
  });
});

Deno.test('Workspace router - fs read rejects disallowed extensions', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    await Deno.writeTextFile(dataLayer.fs.root + '/notes.pdf', 'x');
    const res = await handle('/api/workspace/fs/read?path=notes.pdf', undefined, loopbackInfo());
    assertEquals(res.status, 403);
  });
});

Deno.test('Workspace router - fs patch merges frontmatter without losing fields', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const path = 'debts/alice-1234.md';
    const id = crypto.randomUUID();
    await dataLayer.fs.writeTextAtomic(path, pendingDebt('borrowed', 10000, 'VND', 'Alice', id));

    const res = await handle(
      '/api/workspace/fs/patch',
      {
        method: 'POST',
        body: JSON.stringify({ path, patch: { frontmatter: { status: 'paid' }, body: 'repaid' } }),
        headers: { 'content-type': 'application/json' },
      },
      loopbackInfo(),
    );
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.frontmatter.status, 'paid');
    assertEquals(payload.data.frontmatter.personName, 'Alice');
    assertEquals(payload.data.body, 'repaid');
    assertEquals(payload.data.frontmatter.amount, 10000);
    assertEquals(payload.data.frontmatter.id, id);
  });
});

Deno.test('Workspace router - fs write creates a markdown file from frontmatter + body', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle(
      '/api/workspace/fs/write',
      {
        method: 'POST',
        body: JSON.stringify({
          path: 'notes/2025-01-01.md',
          content: 'Body content',
          frontmatter: { order: 'asc', count: 3 },
        }),
        headers: { 'content-type': 'application/json' },
      },
      loopbackInfo(),
    );
    assertEquals(res.status, 200);
    const raw = await dataLayer.fs.readText('notes/2025-01-01.md');
    assertEquals(raw.includes('order: asc'), true);
    assertEquals(raw.includes('count: 3'), true);
    assertEquals(raw.includes('Body content'), true);
  });
});

Deno.test('Workspace router - fs list filters by allowed extensions and hidden dirs', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    await dataLayer.fs.writeTextAtomic('a.md', '---\n---\nhi');
    await dataLayer.fs.writeTextAtomic('a.json', '{}');
    await dataLayer.fs.writeTextAtomic('a.txt', 'hi');
    await dataLayer.fs.writeTextAtomic('notes.pdf', 'x');
    const res = await handle('/api/workspace/fs/list?glob=**/*', undefined, loopbackInfo());
    const payload = await json(res);
    const names = payload.data.map((p: string) => p.split('/').pop());
    assertEquals(names.includes('a.md'), true);
    assertEquals(names.includes('a.json'), true);
    assertEquals(names.includes('a.txt'), true);
    assertEquals(names.includes('notes.pdf'), false);
    assertEquals(names.includes('config.json'), false); // .workboost dir is hidden -> excluded
  });
});

Deno.test('Workspace router - GET /api/workspace/debts returns pending debts', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    await dataLayer.fs.writeTextAtomic('debts/alice.md', pendingDebt('lent', 100, 'VND', 'Alice'));
    await dataLayer.fs.writeTextAtomic('debts/bob.md', pendingDebt('borrowed', 5, 'USD', 'Bob'));

    const res = await handle('/api/workspace/debts', undefined, loopbackInfo());
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.length, 2);
  });
});

Deno.test('Workspace router - GET /api/workspace/debts?status=paid includes archived settled debts', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const bobId = crypto.randomUUID();
    await dataLayer.fs.writeTextAtomic('debts/alice.md', pendingDebt('lent', 100, 'VND', 'Alice'));
    await dataLayer.fs.writeTextAtomic(
      'debts/bob.md',
      pendingDebt('borrowed', 5, 'USD', 'Bob', bobId),
    );
    await dataLayer.debts.settle(bobId);

    const res = await handle('/api/workspace/debts?status=paid', undefined, loopbackInfo());
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.length, 1);
    assertEquals(payload.data[0].frontmatter.id, bobId);
  });
});

Deno.test('Workspace router - GET /api/workspace/debts/summary splits currencies (FR-06)', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    await dataLayer.fs.writeTextAtomic(
      'debts/alice.md',
      pendingDebt('lent', 1000000, 'VND', 'Alice'),
    );
    await dataLayer.fs.writeTextAtomic('debts/bob.md', pendingDebt('borrowed', 50, 'USD', 'Bob'));

    const res = await handle('/api/workspace/debts/summary', undefined, loopbackInfo());
    assertEquals(res.status, 200);
    const payload = await json(res);
    const summary = payload.data;
    assertEquals(Object.keys(summary.currencies).sort(), ['USD', 'VND']);
    assertEquals(summary.currencies.VND.lent, 1000000);
    assertEquals(summary.currencies.USD.borrowed, 50);
  });
});

Deno.test('Workspace router - POST /api/workspace/debts/create sets updatedBy=user', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle(
      '/api/workspace/debts/create',
      {
        method: 'POST',
        body: JSON.stringify({ personName: 'Carol', amount: 30, direction: 'lent' }),
        headers: { 'content-type': 'application/json' },
      },
      loopbackInfo(),
    );
    assertEquals(res.status, 201);
    const payload = await json(res);
    assertEquals(payload.data.frontmatter.updatedBy, 'user');
    assertEquals(payload.data.frontmatter.personName, 'Carol');
  });
});

Deno.test('Workspace router - POST /api/workspace/debts/:id/settle moves file to archive', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const id = crypto.randomUUID();
    await dataLayer.fs.writeTextAtomic(
      'debts/alice.md',
      pendingDebt('lent', 100, 'VND', 'Alice', id),
    );

    const res = await handle(
      `/api/workspace/debts/${id}/settle`,
      { method: 'POST' },
      loopbackInfo(),
    );
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.frontmatter.status, 'paid');
    assertEquals(await dataLayer.fs.exists('debts/alice.md'), false);
    assertEquals(await dataLayer.fs.exists('debts/archive/alice.md'), true);
  });
});

Deno.test('Workspace router - POST /api/workspace/debts/:id/cancel moves file to archive', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const id = crypto.randomUUID();
    await dataLayer.fs.writeTextAtomic(
      'debts/bob.md',
      pendingDebt('borrowed', 7, 'USD', 'Bob', id),
    );

    const res = await handle(
      `/api/workspace/debts/${id}/cancel`,
      { method: 'POST' },
      loopbackInfo(),
    );
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.frontmatter.status, 'cancelled');
    assertEquals(await dataLayer.fs.exists('debts/bob.md'), false);
    assertEquals(await dataLayer.fs.exists('debts/archive/bob.md'), true);
  });
});

Deno.test('Workspace router - DELETE /api/workspace/debts/:id removes file', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const id = crypto.randomUUID();
    await dataLayer.fs.writeTextAtomic(
      'debts/carol.md',
      pendingDebt('lent', 50, 'USD', 'Carol', id),
    );

    const res = await handle(`/api/workspace/debts/${id}`, { method: 'DELETE' }, loopbackInfo());
    assertEquals(res.status, 200);
    assertEquals(await dataLayer.fs.exists('debts/carol.md'), false);
  });
});

Deno.test('Workspace router - NFR-04 corrupted YAML debt file does not break the listing (500) or summary', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const goodId = crypto.randomUUID();
    await dataLayer.fs.writeTextAtomic(
      'debts/good.md',
      pendingDebt('lent', 100, 'VLD', 'Alice', goodId),
    );
    // corrupted: invalid YAML frontmatter
    await dataLayer.fs.writeTextAtomic(
      'debts/broken.md',
      '---\nfoo: [unclosed\nbar: - baz\n---\nbroken body',
    );

    const listRes = await handle('/api/workspace/debts', undefined, loopbackInfo());
    assertEquals(listRes.status, 200);
    const listPayload = await json(listRes);
    assertEquals(listPayload.data.length, 1);
    assertEquals(listPayload.data[0].frontmatter.id, goodId);

    const summaryRes = await handle('/api/workspace/debts/summary', undefined, loopbackInfo());
    assertEquals(summaryRes.status, 200);
  });
});

Deno.test('Workspace router - fs read of a corrupted markdown degrades to body-only instead of 500', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const path = 'debts/broken.md';
    await dataLayer.fs.writeTextAtomic(path, '---\nfoo: [unclosed\n---\nraw body');

    const res = await handle(
      `/api/workspace/fs/read?path=${encodeURIComponent(path)}`,
      undefined,
      loopbackInfo(),
    );
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.body, 'raw body');
  });
});

Deno.test('Workspace router - GET /api/workspace/daily/today returns today report', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const today = new Date().toISOString().slice(0, 10);
    await dataLayer.dailyWork.save(today, {
      completed: [{ project: 'INBOX', task: 'test' }],
      incomplete: [],
      planned: [],
    });

    const res = await handle('/api/workspace/daily/today', undefined, loopbackInfo());
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.frontmatter.date, today);
  });
});

Deno.test('Workspace router - POST /api/workspace/daily/:date saves with updatedBy=user', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle(
      '/api/workspace/daily/2025-03-03',
      {
        method: 'POST',
        body: JSON.stringify({
          report: {
            completed: [{ project: 'Proj', task: 'do thing' }],
            incomplete: [],
            planned: [{ project: 'Proj', task: 'plan thing' }],
          },
          customSections: '### Extra\n- note',
        }),
        headers: { 'content-type': 'application/json' },
      },
      loopbackInfo(),
    );
    assertEquals(res.status, 200);
    const payload = await json(res);
    assertEquals(payload.data.frontmatter.updatedBy, 'user');
    assertEquals(payload.data.frontmatter.date, '2025-03-03');
  });
});

Deno.test('Workspace router - validates daily date format and rejects bad report body', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const badDate = await handle('/api/workspace/daily/not-a-date', undefined, loopbackInfo());
    assertEquals(badDate.status, 400);

    const badReport = await handle(
      '/api/workspace/daily/2025-01-01',
      {
        method: 'POST',
        body: JSON.stringify({ report: 'not-an-object' }),
        headers: { 'content-type': 'application/json' },
      },
      loopbackInfo(),
    );
    assertEquals(badReport.status, 400);
  });
});

Deno.test('Workspace router - returns Cache-Control: no-store on JSON APIs', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle('/api/workspace/debts/summary', undefined, loopbackInfo());
    assertEquals(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
  });
});

Deno.test('Workspace router - unknown workspace route returns 404', async () => {
  await withTempWorkspace(async ({ dataLayer }) => {
    const handle = routerFor(dataLayer);
    const res = await handle('/api/workspace/nope', undefined, loopbackInfo());
    assertEquals(res.status, 404);
  });
});
