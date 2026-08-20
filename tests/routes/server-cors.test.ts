import { assertEquals } from '@std/assert';
import { addCorsHeaders } from '@work-boost/api/server.ts';

Deno.test('CORS does not grant access to an untrusted origin', () => {
  const request = new Request('http://localhost:3001/api/workspace/fs/list', {
    headers: { Origin: 'https://untrusted.example' },
  });
  const response = addCorsHeaders(request, new Response('ok'), ['http://localhost:3000']);

  assertEquals(response.headers.has('Access-Control-Allow-Origin'), false);
  assertEquals(response.headers.has('Access-Control-Allow-Credentials'), false);
});

Deno.test('CORS grants credentials only to an allowed origin', () => {
  const request = new Request('http://localhost:3001/api/workspace/fs/list', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const response = addCorsHeaders(request, new Response('ok'), ['http://localhost:3000']);

  assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  assertEquals(response.headers.get('Access-Control-Allow-Credentials'), 'true');
});
