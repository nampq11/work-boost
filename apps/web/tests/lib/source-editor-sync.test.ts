import { assert, assertFalse } from '@std/assert';
import {
  shouldApplyDeferredExternal,
  shouldReplaceExternally,
} from '../../src/lib/source-editor-sync.ts';

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

Deno.test('shouldApplyDeferredExternal applies a deferred external value after composition', () => {
  // No composition commit observed (cancelled IME): the external value wins.
  assert(shouldApplyDeferredExternal('base', 'remote', 'base'));
  // Never observed a composition start: apply conservatively (keep editor in
  // sync with the store).
  assert(shouldApplyDeferredExternal('base', 'remote', null));
});

Deno.test('shouldApplyDeferredExternal discards a deferred value when the user committed text', () => {
  // The doc changed during composition, so the user's edit echoes to the store
  // and must win over the deferred external value.
  assertFalse(shouldApplyDeferredExternal('base日本', 'remote', 'base'));
  // Nothing to apply.
  assertFalse(shouldApplyDeferredExternal('base', null, 'base'));
  // Already consistent with the deferred value.
  assertFalse(shouldApplyDeferredExternal('remote', 'remote', 'base'));
});
