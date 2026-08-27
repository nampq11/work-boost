import { assert, assertFalse } from '@std/assert';
import { isValidSessionId } from '../../src/utils/security.ts';

Deno.test('isValidSessionId allows UUIDs', () => {
  assert(isValidSessionId('123e4567-e89b-12d3-a456-426614174000'));
});

Deno.test('isValidSessionId allows valid custom ids', () => {
  assert(isValidSessionId('telegram_1234567890'));
  assert(isValidSessionId('slack_U12345678'));
  assert(isValidSessionId('scheduler'));
});

Deno.test('isValidSessionId rejects weak ids', () => {
  assertFalse(isValidSessionId('a'));
  assertFalse(isValidSessionId('123'));
  assertFalse(isValidSessionId('default'));
});
