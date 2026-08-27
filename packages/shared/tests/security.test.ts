import { assert, assertFalse } from '@std/assert';
import { timingSafeEqual } from '@work-boost/shared/security.ts';

Deno.test('timingSafeEqual returns true for identical strings', () => {
  assert(timingSafeEqual('same-value', 'same-value'));
});

Deno.test('timingSafeEqual returns false for different strings', () => {
  assertFalse(timingSafeEqual('same-value', 'different-value'));
  assertFalse(timingSafeEqual('short', 'shorter'));
  assertFalse(timingSafeEqual('abc', 'abd'));
});

Deno.test('timingSafeEqual handles empty strings correctly', () => {
  assert(timingSafeEqual('', ''));
  assertFalse(timingSafeEqual('', 'a'));
  assertFalse(timingSafeEqual('a', ''));
});

Deno.test('timingSafeEqual returns false for different strings of same length', () => {
  assertFalse(timingSafeEqual('abc', 'cba'));
  assertFalse(timingSafeEqual('a', 'b'));
  assertFalse(timingSafeEqual('12345', '12346'));
  assertFalse(timingSafeEqual('test-1', 'test-2'));
});
