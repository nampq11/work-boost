/// <reference lib="deno.ns" />
import { type UpdatePhase, type UpdateStatus } from '../../src/store/update-store.ts';

interface StoreModule {
  useUpdateStore: {
    getState: () => {
      status: UpdateStatus;
      phase: UpdatePhase | null;
      info: { version: string } | null;
      error: string | null;
      setChecking: () => void;
      setAvailable: (info: { version: string }) => void;
      setUpdating: (phase?: UpdatePhase) => void;
      setPhase: (phase: UpdatePhase) => void;
      setError: (message: string) => void;
      setIdle: () => void;
    };
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

async function freshStore(): Promise<StoreModule> {
  return (await import(
    `../../src/store/update-store.ts?t=fresh-${Date.now()}-${Math.random()}`
  )) as StoreModule;
}

Deno.test('available transitions from a fresh check', async () => {
  const mod = await freshStore();
  const store = mod.useUpdateStore;
  store.getState().setAvailable({ version: '0.5.0' });
  const s = store.getState();
  assertEqual(s.status, 'available', 'status should be available');
  assertEqual(s.info?.version, '0.5.0', 'info should carry the version');
  assertEqual(s.phase, null, 'no phase before install starts');
});

Deno.test('updating starts in waiting-permission and walks through phases', async () => {
  const mod = await freshStore();
  const store = mod.useUpdateStore;
  store.getState().setAvailable({ version: '0.5.0' });
  store.getState().setUpdating();
  assertEqual(store.getState().status, 'updating', 'status should be updating');
  assertEqual(
    store.getState().phase,
    'waiting-permission',
    'install should start in waiting-permission',
  );

  store.getState().setPhase('downloading');
  assertEqual(store.getState().phase, 'downloading', 'downloading phase should be recorded');
  store.getState().setPhase('installing');
  assertEqual(store.getState().phase, 'installing', 'installing phase should be recorded');
  store.getState().setPhase('restarting');
  assertEqual(store.getState().phase, 'restarting', 'restarting phase should be recorded');
  assertEqual(store.getState().status, 'updating', 'status stays updating through phases');
});

Deno.test('setError is terminal and a stale phase cannot downgrade it', async () => {
  const mod = await freshStore();
  const store = mod.useUpdateStore;
  store.getState().setAvailable({ version: '0.5.0' });
  store.getState().setUpdating();
  store.getState().setError('download failed');
  assertEqual(store.getState().status, 'error', 'status should be error');
  assertEqual(store.getState().error, 'download failed', 'error message should be stored');
  assertEqual(store.getState().phase, 'failed', 'phase should be failed');

  // A late-arriving positive phase must not resurrect an already-failed update.
  store.getState().setPhase('downloading');
  assertEqual(store.getState().status, 'error', 'error is terminal');
  assertEqual(store.getState().phase, 'failed', 'phase stays failed');
});

Deno.test('a stale phase outside a running install is ignored', async () => {
  const mod = await freshStore();
  const store = mod.useUpdateStore;
  store.getState().setAvailable({ version: '0.5.0' });
  store.getState().setPhase('downloading');
  const s = store.getState();
  assertEqual(s.status, 'available', 'available should not flip to updating');
  assertEqual(s.phase, null, 'no phase recorded before install starts');
});

Deno.test('retrying from error restarts the install in waiting-permission', async () => {
  const mod = await freshStore();
  const store = mod.useUpdateStore;
  store.getState().setAvailable({ version: '0.5.0' });
  store.getState().setUpdating();
  store.getState().setError('installer exited with code 1');
  store.getState().setUpdating();
  assertEqual(store.getState().status, 'updating', 'retry returns to updating');
  assertEqual(store.getState().phase, 'waiting-permission', 'retry restarts in waiting-permission');
  assertEqual(store.getState().error, null, 'error is cleared on retry');
});

Deno.test('setIdle resets phase and error', async () => {
  const mod = await freshStore();
  const store = mod.useUpdateStore;
  store.getState().setAvailable({ version: '0.5.0' });
  store.getState().setUpdating();
  store.getState().setError('boom');
  store.getState().setIdle();
  const s = store.getState();
  assertEqual(s.status, 'idle', 'status resets to idle');
  assertEqual(s.phase, null, 'phase resets');
  assertEqual(s.error, null, 'error resets');
  assertEqual(s.info, null, 'info resets');
});
