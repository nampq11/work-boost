export interface ExpiringStore<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
}

interface StoreEntry<T> {
  value: T;
  expiresAt: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

export function createExpiringStore<T>(ttlMs: number): ExpiringStore<T> {
  const entries = new Map<string, StoreEntry<T>>();

  function removeExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
  }

  const cleanupTimer = setInterval(removeExpiredEntries, CLEANUP_INTERVAL_MS);

  function get(key: string): T | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  function set(key: string, value: T): void {
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function has(key: string): boolean {
    return get(key) !== undefined;
  }

  function deleteEntry(key: string): void {
    entries.delete(key);
  }

  function clear(): void {
    entries.clear();
    clearInterval(cleanupTimer);
  }

  return { get, set, has, delete: deleteEntry, clear };
}
