/**
 * Centralized database key definitions for Deno KV
 *
 * All database access MUST use these helpers for consistency.
 * This ensures uniform key structure and makes schema changes easier.
 *
 * Primary Key Structure:
 * - ['users', userId] -> User
 * - ['messages', messageId] -> Message
 * - ['subscriptions', userId] -> Subscription
 *
 * Secondary Index Structure:
 * - ['subscriptions_by_user', userId] -> Subscription (lookup by user)
 * - ['active_subscriptions', userId] -> Subscription (only active subs)
 * - ['messages_by_user', userId, messageId] -> Message (user's messages)
 *
 * Migration Keys:
 * - ['migration', migrationName] -> boolean (completed flag)
 * - ['users', userId, '_migrated'] -> boolean (migration marker)
 */

/**
 * Primary keys
 */
export const PrimaryKeys = {
  user: (id: string) => ['users', id] as const,
  message: (id: string) => ['messages', id] as const,
  subscription: (userId: string) => ['subscriptions', userId] as const,
} as const;

/**
 * Secondary index keys
 */
export const IndexKeys = {
  // Subscription indexes
  subscriptionByUser: (userId: string) => ['subscriptions_by_user', userId] as const,
  activeSubscription: (userId: string) => ['active_subscriptions', userId] as const,

  // Message indexes
  messagesByUserPrefix: (userId: string) => ['messages_by_user', userId] as const,
  messageByUser: (userId: string, messageId: string) =>
    ['messages_by_user', userId, messageId] as const,

  // Legacy (for backward compatibility)
  messagesByUserId: (userId: string) => ['messagesByUserId', userId] as const,

  // Migration keys
  migration: (name: string) => ['migration', name] as const,
  userMigrated: (userId: string) => ['users', userId, '_migrated'] as const,
} as const;

/**
 * Helper for indexed lookups with type safety
 */
export async function getIndexed<T>(kv: Deno.Kv, key: readonly string[]): Promise<T | null> {
  const result = await kv.get<T>(key);
  return result.value ?? null;
}

/**
 * Helper for indexed list with type safety
 */
export async function listIndexed<T>(kv: Deno.Kv, prefix: readonly string[]): Promise<T[]> {
  const results: T[] = [];
  const iter = kv.list<T>({ prefix });
  for await (const entry of iter) {
    results.push(entry.value);
  }
  return results;
}

/**
 * Check if a key exists
 */
export async function keyExists(kv: Deno.Kv, key: readonly string[]): Promise<boolean> {
  const result = await kv.get(key);
  return result.value !== null || result.versionstamp !== null;
}
