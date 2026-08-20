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
