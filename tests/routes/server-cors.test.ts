import { assertEquals } from '@std/assert';
import { addCorsHeaders } from '@work-boost/api/server.ts';

Deno.test('CORS does not grant access to an untrusted origin', () => {
  const request = new Request('http://localhost:3001/api/workspace/fs/list', {
    headers: { Origin: 'https://untrusted.example' },
  });
  const response = addCorsHeaders(
    request,
    new Response('ok', { headers: { Vary: 'Accept-Encoding' } }),
    ['http://localhost:3000'],
  );

  assertEquals(response.headers.has('Access-Control-Allow-Origin'), false);
  assertEquals(response.headers.has('Access-Control-Allow-Credentials'), false);
  assertEquals(response.headers.get('Vary'), 'Accept-Encoding, Origin');
});

Deno.test('CORS grants credentials only to an allowed origin', () => {
  const request = new Request('http://localhost:3001/api/workspace/fs/list', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const response = addCorsHeaders(request, new Response('ok'), ['http://localhost:3000']);

  assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  assertEquals(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assertEquals(response.headers.get('Vary'), 'Origin');
});

Deno.test('CORS allows explicit loopback fallbacks, including IPv6', () => {
  for (const origin of ['http://localhost:4000', 'http://[::1]:4000']) {
    const request = new Request('http://localhost:3001/api/workspace/fs/list', {
      headers: { Origin: origin },
    });
    const response = addCorsHeaders(request, new Response('ok'), ['http://example.com']);
    assertEquals(response.headers.get('Access-Control-Allow-Origin'), origin);
  }
});

Deno.test('CORS varies on Origin when the request has no origin', () => {
  const response = addCorsHeaders(
    new Request('http://localhost:3001/api/workspace/fs/list'),
    new Response('ok'),
  );
  assertEquals(response.headers.get('Vary'), 'Origin');
});
