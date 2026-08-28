/// <reference lib="deno.ns" />
import { assertEquals } from '@std/assert';
import { useUpdateStore } from '../../src/store/update-store.ts';

// The store is a module-level singleton with no load-time side effects (unlike
// `ui-store`, which reads localStorage at import), so it needs no per-test import
// isolation. Each test sets up its own starting state.
const getState = () => useUpdateStore.getState();

Deno.test('available transitions from a fresh check', () => {
  getState().setAvailable({ version: '0.5.0' });
  const s = getState();
  assertEquals(s.status, 'available');
  assertEquals(s.info?.version, '0.5.0');
  assertEquals(s.phase, null);
});

Deno.test('updating starts in waiting-permission and walks through phases', () => {
  getState().setAvailable({ version: '0.5.0' });
  getState().setUpdating();
  assertEquals(getState().status, 'updating');
  assertEquals(getState().phase, 'waiting-permission');

  getState().setPhase('downloading');
  assertEquals(getState().phase, 'downloading');
  getState().setPhase('installing');
  assertEquals(getState().phase, 'installing');
  getState().setPhase('restarting');
  assertEquals(getState().phase, 'restarting');
  assertEquals(getState().status, 'updating');
});

Deno.test('setError is terminal and a stale phase cannot downgrade it', () => {
  getState().setAvailable({ version: '0.5.0' });
  getState().setUpdating();
  getState().setError('download failed');
  assertEquals(getState().status, 'error');
  assertEquals(getState().error, 'download failed');
  assertEquals(getState().phase, 'failed');

  getState().setPhase('downloading');
  assertEquals(getState().status, 'error');
  assertEquals(getState().phase, 'failed');
});

Deno.test('a stale phase outside a running install is ignored', () => {
  getState().setAvailable({ version: '0.5.0' });
  getState().setPhase('downloading');
  const s = getState();
  assertEquals(s.status, 'available');
  assertEquals(s.phase, null);
});

Deno.test('retrying from error restarts the install in waiting-permission', () => {
  getState().setAvailable({ version: '0.5.0' });
  getState().setUpdating();
  getState().setError('installer exited with code 1');
  getState().setUpdating();
  assertEquals(getState().status, 'updating');
  assertEquals(getState().phase, 'waiting-permission');
  assertEquals(getState().error, null);
});

Deno.test('setIdle resets phase and error', () => {
  getState().setAvailable({ version: '0.5.0' });
  getState().setUpdating();
  getState().setError('boom');
  getState().setIdle();
  const s = getState();
  assertEquals(s.status, 'idle');
  assertEquals(s.phase, null);
  assertEquals(s.error, null);
  assertEquals(s.info, null);
});
