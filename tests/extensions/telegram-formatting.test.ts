import { assertEquals } from '@std/assert';
import { splitMessage } from '@work-boost/extensions/formatters/telegram-formatter.ts';

Deno.test('splitMessage preserves the existing Telegram message splitting behavior', () => {
  assertEquals(splitMessage('first\nsecond\nthird', 12), ['first\nsecond', 'third']);
  assertEquals(splitMessage('abcdefgh', 3), ['abc', 'def', 'gh']);
});
