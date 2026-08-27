import { assert, assertEquals } from '@std/assert';
import { successResponse } from '../../src/utils/response.ts';

Deno.test('successResponse - basic usage', async () => {
  const data = { foo: 'bar' };
  const response = successResponse(data);

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'application/json');

  const body = await response.json();
  assertEquals(body.success, true);
  assertEquals(body.data, data);
  assert(body.meta.timestamp);
  assertEquals(body.meta.requestId, undefined);
});

Deno.test('successResponse - with custom status code', async () => {
  const data = { id: 123 };
  const response = successResponse(data, 201);

  assertEquals(response.status, 201);

  const body = await response.json();
  assertEquals(body.success, true);
  assertEquals(body.data, data);
});

Deno.test('successResponse - with custom status code and request ID', async () => {
  const data = { id: 123 };
  const requestId = 'req-12345';
  const response = successResponse(data, 201, requestId);

  assertEquals(response.status, 201);
  assertEquals(response.headers.get('X-Request-ID'), requestId);

  const body = await response.json();
  assertEquals(body.success, true);
  assertEquals(body.data, data);
  assertEquals(body.meta.requestId, requestId);
});
