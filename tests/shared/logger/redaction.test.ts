/**
 * Tests for sensitive data redaction in the shared logger
 */

import { assertEquals } from '@std/assert';
import { redactRecursively, redactSensitiveData } from '@work-boost/shared/logger/logger.ts';

Deno.test('redactSensitiveData redacts quoted JSON values', () => {
  assertEquals(
    redactSensitiveData('{"apiKey": "sk-12345", "user": "alice"}'),
    '{"apiKey": "***REDACTED***", "user": "alice"}',
  );
});

Deno.test('redactSensitiveData redacts single-quoted JSON values', () => {
  assertEquals(redactSensitiveData("{'secret': 'val123'}"), "{'secret': '***REDACTED***'}");
});

Deno.test('redactSensitiveData redacts unquoted key=value pairs', () => {
  assertEquals(redactSensitiveData('token=abc123'), 'token=***REDACTED***');
});

Deno.test('redactSensitiveData redacts colon-separated values', () => {
  assertEquals(redactSensitiveData('password: hunter2'), 'password: ***REDACTED***');
});

Deno.test('redactSensitiveData redacts query-string values', () => {
  assertEquals(redactSensitiveData('?auth=xyz&page=1'), '?auth=***REDACTED***&page=1');
});

Deno.test('redactSensitiveData redacts multiple keys in one message', () => {
  assertEquals(
    redactSensitiveData('apiKey=abc token=xyz'),
    'apiKey=***REDACTED*** token=***REDACTED***',
  );
});

Deno.test('redactSensitiveData redacts quoted values containing escaped delimiters', () => {
  assertEquals(redactSensitiveData('token="a\\"b"'), 'token="***REDACTED***"');
});

Deno.test('redactRecursively redacts values under sensitive metadata keys', () => {
  assertEquals(redactRecursively({ user: 'alice', token: 'abc123', data: { apiKey: 'sk-1' } }), {
    user: 'alice',
    token: '***REDACTED***',
    data: { apiKey: '***REDACTED***' },
  });
});

Deno.test('redactRecursively redacts sensitive metadata keys case-insensitively', () => {
  assertEquals(redactRecursively({ Token: 'abc', Password: 'xyz' }), {
    Token: '***REDACTED***',
    Password: '***REDACTED***',
  });
});

Deno.test('redactRecursively terminates on circular metadata', () => {
  const circular: Record<string, unknown> = { name: 'circle' };
  circular.self = circular;
  assertEquals(redactRecursively({ config: circular }), {
    config: { name: 'circle', self: '[Circular]' },
  });
});
