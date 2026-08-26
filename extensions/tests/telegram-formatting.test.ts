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

Deno.test('splitMessage never cuts inside an HTML tag', () => {
  // A dangling <b> would make Telegram reject the whole chunk as malformed HTML.
  const text = `${'x'.repeat(10)}<b>bold</b>\nrest`;
  const chunks = splitMessage(text, 12);
  const [first] = chunks;
  // No chunk may end mid-tag; the tag moves wholly into the next chunk.
  assertEquals(first!.endsWith('<'), false);
  assertEquals(first!.endsWith('</'), false);
  assertEquals(chunks.join('\n').includes('<b>bold</b>'), true);

  // A single unbreakable line longer than maxLength still splits without looping forever.
  assertEquals(splitMessage('<a>'.repeat(5), 4).length > 1, true);
});
