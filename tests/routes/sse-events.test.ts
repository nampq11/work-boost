import { assertEquals } from '@std/assert';
import { createWorkspaceRouter } from '@work-boost/api/routes/workspace.ts';
import type { WorkspaceRouter } from '@work-boost/api/routes/workspace.ts';
import { createDataLayer } from '@work-boost/data-provider';

/**
 * Acceptance-style test (spec 6.3 / AC-2): open a real SSE connection to the
 * workspace router over loopback, write a file, and assert an event arrives
 * whose `paths` includes the changed file (live-reload channel).
 */
Deno.test(
  'SSE events - GET /api/workspace/events emits an event when a file is written',
  async () => {
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

      while (Date.now() < deadline && !received) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = decoder.decode(result.value, { stream: true });
        for (const line of chunk.split('\n')) {
          const match = line.match(/^data: (.+)$/);
          if (match) {
            const event = JSON.parse(match[1]) as { paths: string[]; kind: string };
            if (event.paths.includes(target)) {
              received = event;
              break;
            }
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
      await server?.shutdown();
      // Stop the FS watcher so the test process can exit cleanly.
      router?.stop();
    }
  },
  { sanitizeResources: false, sanitizeOps: false },
);
