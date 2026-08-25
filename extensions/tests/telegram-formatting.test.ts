import { assertEquals, assertThrows } from '@std/assert';
import { splitMessage } from '@work-boost/extensions/formatters/telegram-formatter.ts';

Deno.test('splitMessage preserves the existing Telegram message splitting behavior', () => {
  assertEquals(splitMessage('first\nsecond\nthird', 12), ['first\nsecond', 'third']);
  assertEquals(splitMessage('abcdefgh', 3), ['abc', 'def', 'gh']);
});

Deno.test('splitMessage rejects invalid message lengths', () => {
  assertThrows(() => splitMessage('text', 0), RangeError, 'maxLength must be a positive integer');
  assertThrows(() => splitMessage('text', -1), RangeError, 'maxLength must be a positive integer');
  assertThrows(() => splitMessage('text', 1.5), RangeError, 'maxLength must be a positive integer');
});
