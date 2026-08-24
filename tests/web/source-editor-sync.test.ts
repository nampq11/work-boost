import { assert, assertFalse } from '@std/assert';
import { shouldReplaceExternally } from '../../apps/web/src/lib/source-editor-sync.ts';

Deno.test('shouldReplaceExternally returns false when doc already matches value', () => {
  // Echo of a user edit: no external dispatch must happen.
  assertFalse(shouldReplaceExternally('# Hello\n', '# Hello\n'));
  assertFalse(shouldReplaceExternally('', ''));
});

Deno.test('shouldReplaceExternally returns true when an external dispatch is required', () => {
  assert(shouldReplaceExternally('# Old\n', '# New\n'));
  assert(shouldReplaceExternally('', '# Fresh document\n'));
  assert(shouldReplaceExternally('# Draft\n', ''));
});
