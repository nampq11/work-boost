import { assertEquals } from '@std/assert';
import { createWorkspaceRouter } from '@work-boost/api/routes/workspace.ts';
import type { WorkspaceRouter } from '@work-boost/api/routes/workspace.ts';
import { createDataLayer } from '@work-boost/data-provider';

/**
 * Acceptance-style test (spec 6.3 / AC-2): open a real SSE connection to the
 * workspace router over loopback, write a file, and assert an event arrives
 * whose `paths` includes the changed file (live-reload channel).
 */
Deno.test({
  name: 'SSE events - GET /api/workspace/events emits an event when a file is written',
  fn: async () => {
    const tempRoot = await Deno.makeTempDir({ prefix: 'work-boost-sse-' });
    let server: Deno.HttpServer | undefined;
    let router: WorkspaceRouter | undefined;
    try {
      const dl = createDataLayer(tempRoot);
      await dl.fs.init();
      await dl.config.load();
      router = createWorkspaceRouter({ dataLayer: dl, apiPrefix: '/api' });
      const started = Promise.withResolvers<{ port: number }>();
      server = await Deno.serve(
        {
          port: 0,
          hostname: '127.0.0.1',
          onListen(listener) {
            started.resolve({ port: listener.port });
          },
        },
        (request, info) => router!.handle(request, info),
      );

      const { port } = await started.promise;
      const res = await fetch(`http://127.0.0.1:${port}/api/workspace/events`);
      if (res.status !== 200) throw new Error(`expected SSE 200, got ${res.status}`);
      if (res.headers.get('content-type') !== 'text/event-stream; charset=utf-8') {
        throw new Error('expected text/event-stream content-type');
      }
      if (res.headers.get('cache-control') !== 'no-store, no-cache, must-revalidate') {
        throw new Error('expected no-store cache-control');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const target = 'daily/2025-01-01-event.md';

      // Mutate the workspace after subscribing so the watcher emits an event.
      await dl.fs.writeTextAtomic(target, '---\n---\nbody\n');

      const deadline = Date.now() + 4000;
      let received: { paths: string[]; kind: string } | null = null;
      let buffer = '';

      while (Date.now() < deadline && !received) {
        const remaining = deadline - Date.now();
        let timeoutId: number | undefined;
        const timeout = new Promise<{ timedOut: true }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ timedOut: true }), remaining);
        });
        const result = await Promise.race([
          reader.read().then((value) => ({ timedOut: false as const, value })),
          timeout,
        ]);
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (result.timedOut) {
          await reader.cancel();
          break;
        }
        if (result.value.done) break;

        buffer += decoder.decode(result.value.value, { stream: true });
        const records = buffer.split('\n\n');
        buffer = records.pop() ?? '';
        for (const record of records) {
          const dataLine = record.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice('data: '.length)) as {
            paths: string[];
            kind: string;
          };
          if (event.paths.includes(target)) {
            received = event;
            break;
          }
        }
      }

      if (!received) throw new Error('Timed out waiting for SSE change event');
      // writeTextAtomic uses a temp-file + rename, so the kind is 'rename',
      // but any change kind satisfying the contract is acceptable.
      assertEquals(received.paths.includes(target), true);
      assertEquals(['create', 'modify', 'remove', 'rename'].includes(received.kind), true);

      await reader.cancel();
    } finally {
      // Close active SSE streams and the FS watcher before HTTP shutdown.
      router?.stop();
      await server?.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'SSE events - router stop closes active streams before server shutdown',
  fn: async () => {
    const tempRoot = await Deno.makeTempDir({ prefix: 'work-boost-sse-stop-' });
    const dataLayer = createDataLayer(tempRoot);
    await dataLayer.fs.init();
    await dataLayer.config.load();
    const router = createWorkspaceRouter({ dataLayer, apiPrefix: '/api' });
    const started = Promise.withResolvers<{ port: number }>();
    const server = await Deno.serve(
      {
        port: 0,
        hostname: '127.0.0.1',
        onListen(listener) {
          started.resolve({ port: listener.port });
        },
      },
      (request, info) => router.handle(request, info),
    );

    try {
      const { port } = await started.promise;
      const response = await fetch(`http://127.0.0.1:${port}/api/workspace/events`);
      const reader = response.body!.getReader();
      await reader.read();
      router.stop();
      let timeoutId: number | undefined;
      const timeout = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('SSE stream did not close')), 1000);
      });
      const result = await Promise.race([reader.read(), timeout]);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      assertEquals(result.done, true);
    } finally {
      router.stop();
      await server.shutdown();
      await Deno.remove(tempRoot, { recursive: true });
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
