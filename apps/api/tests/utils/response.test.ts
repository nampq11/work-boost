import { assertEquals, assertExists, assertMatch } from '@std/assert';
import { ERROR_CODES, errorResponse, successResponse } from '../../src/utils/response.ts';

Deno.test('successResponse', async (t) => {
  await t.step('formats a basic success response correctly', async () => {
    const data = { id: 1, name: 'Test' };
    const response = successResponse(data);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get('content-type'), 'application/json');

    const body = await response.json();
    assertEquals(body.success, true);
    assertEquals(body.data, data);
    assertExists(body.meta.timestamp);
  });

  await t.step('includes requestId if provided', async () => {
    const response = successResponse({ ok: true }, 201, 'req-123');

    assertEquals(response.status, 201);
    assertEquals(response.headers.get('X-Request-ID'), 'req-123');

    const body = await response.json();
    assertEquals(body.meta.requestId, 'req-123');
  });
});

Deno.test('errorResponse', async (t) => {
  await t.step('formats basic string error correctly', async () => {
    const response = errorResponse(ERROR_CODES.NOT_FOUND, 'Resource not found');

    assertEquals(response.status, 500); // Default status
    assertEquals(response.headers.get('content-type'), 'application/json');

    const body = await response.json();
    assertEquals(body.success, false);
    assertEquals(body.error.code, ERROR_CODES.NOT_FOUND);
    assertEquals(body.error.message, 'Resource not found');
    assertExists(body.meta.timestamp);
  });

  await t.step('uses custom status code and requestId', async () => {
    const response = errorResponse(
      ERROR_CODES.UNAUTHORIZED,
      'Not logged in',
      401,
      undefined,
      'req-456',
    );

    assertEquals(response.status, 401);
    assertEquals(response.headers.get('X-Request-ID'), 'req-456');

    const body = await response.json();
    assertEquals(body.error.code, ERROR_CODES.UNAUTHORIZED);
    assertEquals(body.error.message, 'Not logged in');
    assertEquals(body.meta.requestId, 'req-456');
  });

  await t.step('extracts message from Error objects', async () => {
    const error = new Error('Database connection failed');
    const response = errorResponse(ERROR_CODES.INTERNAL_ERROR, error);

    const body = await response.json();
    assertEquals(body.error.message, 'Database connection failed');
  });

  await t.step('handles unknown object messages gracefully', async () => {
    const response = errorResponse(ERROR_CODES.INTERNAL_ERROR, { some: 'object' });

    const body = await response.json();
    assertEquals(body.error.message, '[object Object]');
  });

  await t.step('formats Error details securely', async () => {
    const errorDetail = new Error('Detailed query error');
    errorDetail.name = 'QueryError';

    const response = errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Query failed', 500, errorDetail);

    const body = await response.json();
    assertEquals(body.error.details.message, 'Detailed query error');
    assertEquals(body.error.details.name, 'QueryError');
    // Ensure stack trace is not exposed
    assertEquals(body.error.details.stack, undefined);
  });

  await t.step('sanitizes object details by stripping functions and symbols', async () => {
    const details = {
      id: 42,
      name: 'Item',
      method: () => 'should be stripped',
      sym: Symbol('hidden'),
      nested: {
        error: new Error('nested error'),
      },
    };

    const response = errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid data', 400, details);

    const body = await response.json();
    assertEquals(body.error.details.id, 42);
    assertEquals(body.error.details.name, 'Item');
    assertEquals(body.error.details.method, '[Function]');
    assertEquals(body.error.details.sym, '[Symbol]');
    assertEquals(body.error.details.nested.error.message, 'nested error');
    assertEquals(body.error.details.nested.error.name, 'Error');
  });

  await t.step('handles circular references in details', async () => {
    const circularDetail: any = { name: 'circular' };
    circularDetail.self = circularDetail;

    const response = errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Circular error',
      500,
      circularDetail,
    );

    const body = await response.json();
    assertEquals(body.error.details.serializationError, true);
    assertMatch(body.error.details.message, /\[object Object\]|TypeError/);
  });

  await t.step('handles simple primitive details', async () => {
    const response = errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Bad value',
      400,
      'Just a string detail',
    );

    const body = await response.json();
    assertEquals(body.error.details, 'Just a string detail');
  });
});
