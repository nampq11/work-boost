/// <reference lib="deno.ns" />
// The store reads localStorage at module load (`initialAutosaveEnabled`). To
// make the default-behavior assertions hermetic and order-independent, we
// import the store dynamically against a clean in-memory stub and re-check
// that with a fresh import guaranteed empty.
interface StoreModule {
  useUiStore: {
    getState: () => {
      isAutosaveEnabled: boolean;
      setAutosaveEnabled: (enabled: boolean) => void;
    };
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

Deno.test('autosave defaults to on when no preference is stored', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  // Start from a clean store so no value is persisted.
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeStorage(),
    configurable: true,
  });
  try {
    const mod = (await import(`./ui-store.ts?t=default-${Date.now()}`)) as StoreModule;
    assertEqual(mod.useUiStore.getState().isAutosaveEnabled, true, 'Autosave should default to on');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
  }
});

Deno.test('setAutosaveEnabled updates and persists the preference', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = makeStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
  try {
    const mod = (await import(`./ui-store.ts?t=persist-${Date.now()}`)) as StoreModule;
    const store = mod.useUiStore;

    store.getState().setAutosaveEnabled(false);
    assertEqual(store.getState().isAutosaveEnabled, false, 'Expected autosave to be off');
    assertEqual(
      storage.getItem('workboost:autosave-enabled'),
      'false',
      'Expected the off state to be persisted',
    );

    store.getState().setAutosaveEnabled(true);
    assertEqual(store.getState().isAutosaveEnabled, true, 'Expected autosave to be back on');
    assertEqual(
      storage.getItem('workboost:autosave-enabled'),
      'true',
      'Expected the on state to be persisted',
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
  }
});
