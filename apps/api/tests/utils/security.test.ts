import { assert, assertEquals } from '@std/assert';
import { isValidSessionId, isValidUUID, sanitizeInput } from '../../src/utils/security.ts';

Deno.test('isValidUUID', async (t) => {
  await t.step('returns true for valid UUIDs', () => {
    assert(isValidUUID('123e4567-e89b-12d3-a456-426614174000'));
    assert(isValidUUID('550e8400-e29b-41d4-a716-446655440000'));
    assert(isValidUUID('00000000-0000-0000-0000-000000000000'));
    assert(isValidUUID('ffffffff-ffff-ffff-ffff-ffffffffffff'));
    // upper case
    assert(isValidUUID('123E4567-E89B-12D3-A456-426614174000'));
  });

  await t.step('returns false for invalid UUIDs', () => {
    assert(!isValidUUID('123e4567-e89b-12d3-a456-42661417400')); // too short
    assert(!isValidUUID('123e4567-e89b-12d3-a456-4266141740000')); // too long
    assert(!isValidUUID('123e4567-e89b-12d3-a456-42661417400g')); // invalid char 'g'
    assert(!isValidUUID('123e4567-e89b-12d3-a456-42661417400-')); // invalid char '-'
    assert(!isValidUUID('123e4567e89b12d3a456426614174000')); // no hyphens
    assert(!isValidUUID('')); // empty string
    assert(!isValidUUID(' ')); // just space
    assert(!isValidUUID('invalid-uuid')); // random string
    assert(!isValidUUID('123e4567-e89b-12d3-a456_426614174000')); // wrong separator
  });
});

Deno.test('isValidSessionId', async (t) => {
  await t.step('returns true for valid session IDs', () => {
    assert(isValidSessionId('123e4567-e89b-12d3-a456-426614174000')); // valid UUID
    assert(isValidSessionId('a')); // min length
    assert(isValidSessionId('a-b_c')); // allowed chars
    assert(isValidSessionId('12345678901234567890123456789012345678901234567890')); // max length 50
  });

  await t.step('returns false for invalid session IDs', () => {
    assert(!isValidSessionId('')); // empty string
    assert(!isValidSessionId('a@b')); // invalid char '@'
    assert(!isValidSessionId('a b')); // invalid char ' '
    assert(!isValidSessionId('123456789012345678901234567890123456789012345678901')); // too long > 50
  });
});

Deno.test('sanitizeInput', async (t) => {
  await t.step('removes control characters', () => {
    assertEquals(sanitizeInput('hello\x00world'), 'helloworld');
    assertEquals(sanitizeInput('hello\x01world'), 'helloworld');
    assertEquals(sanitizeInput('hello\x1Fworld'), 'helloworld');
    assertEquals(sanitizeInput('hello\x7Fworld'), 'helloworld');
  });

  await t.step('keeps newlines and tabs', () => {
    assertEquals(sanitizeInput('hello\nworld'), 'hello\nworld');
    assertEquals(sanitizeInput('hello\tworld'), 'hello\tworld');
    assertEquals(sanitizeInput('hello\rworld'), 'hello\rworld');
  });

  await t.step('handles non-strings gracefully', () => {
    assertEquals(sanitizeInput(null as unknown as string), null as unknown as string);
    assertEquals(sanitizeInput(undefined as unknown as string), undefined as unknown as string);
    assertEquals(sanitizeInput(123 as unknown as string), 123 as unknown as string);
  });
});
