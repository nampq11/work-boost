/**
 * Migration script to convert existing Slack users to new Subscription model
 *
 * Old Model:
 * ['users', slackUserId] -> User { id, username, subscribed }
 *
 * New Model:
 * ['subscriptions', slackUserId] -> Subscription {
 *   userId: slackUserId,
 *   platforms: { slack: slackUserId },
 *   enabled: ['slack'],
 *   subscribedAt: date,
 * }
 */

import type { Platform } from '../../core/bot/bot-service.ts';
import type { Subscription } from '../../entity/subscription.ts';
import type { User } from '../../entity/user.ts';
import type { Database } from './database.ts';
import { IndexKeys } from './indexes.ts';

export interface OldUser {
  id: string;
  username?: string;
  subscribed: boolean;
  subscribedAt?: Date;
}

/**
 * Migrate existing Slack users to the new subscription model
 */
export async function migrateSlackUsersToSubscriptions(db: Database): Promise<void> {
  console.log('Migrating existing Slack users to new subscription model...');

  const users: OldUser[] = [];
  const entries = db['kv'].list({ prefix: ['users'] });

  // Collect all users
  for await (const entry of entries) {
    const user = entry.value as OldUser;
    users.push(user);
  }

  let migrated = 0;
  let skipped = 0;

  for (const oldUser of users) {
    // Only migrate subscribed users
    if (!oldUser.subscribed) {
      skipped++;
      continue;
    }

    // Create new subscription format
    // Use slackUserId as both userId and platforms.slack for backward compat
    const subscription: Subscription = {
      userId: oldUser.id,
      platforms: {
        slack: oldUser.id,
      },
      enabled: ['slack'] as Platform[],
      subscribedAt: oldUser.subscribedAt || new Date(),
      lastSentAt: undefined,
    };

    // Write new subscription
    await db.upsertSubscription(subscription);

    // Keep old record for rollback, mark as migrated
    await db['kv'].set(IndexKeys.userMigrated(oldUser.id), true);

    migrated++;
  }

  console.log(
    `Migration complete: ${migrated} users migrated, ${skipped} skipped (not subscribed)`,
  );

  // Set migration flag
  await db['kv'].set(IndexKeys.migration('slack_to_subscription_v1'), true, {
    expireIn: 365 * 24 * 60 * 60 * 1000, // Cache for 1 year
  });
}

/**
 * Rollback the migration
 */
export async function rollbackMigration(db: Database): Promise<void> {
  console.log('Rolling back Slack user migration...');

  const subscriptions = await db.getAllActiveSubscriptions();
  let rolledBack = 0;

  for (const sub of subscriptions) {
    if (sub.platforms.slack) {
      await db['kv'].delete(['subscriptions', sub.userId]);
      await db['kv'].delete(IndexKeys.userMigrated(sub.platforms.slack));
      rolledBack++;
    }
  }

  console.log(`Rolled back ${rolledBack} subscriptions`);

  // Remove migration flag
  await db['kv'].delete(IndexKeys.migration('slack_to_subscription_v1'));
}

/**
 * Check if migration has been run
 */
export async function hasMigrationRun(db: Database): Promise<boolean> {
  const result = await db['kv'].get(IndexKeys.migration('slack_to_subscription_v1'));
  return result.value !== null;
}

/**
 * Run migration automatically if not already done
 */
export async function runMigrationIfNeeded(db: Database): Promise<void> {
  const hasRun = await hasMigrationRun(db);

  if (!hasRun) {
    const shouldRun = Deno.env.get('RUN_MIGRATION_ON_STARTUP') === 'true';

    if (shouldRun) {
      console.log('Running Slack user migration on startup...');
      await migrateSlackUsersToSubscriptions(db);
    } else {
      console.log('Migration pending. Set RUN_MIGRATION_ON_STARTUP=true to run on next startup.');
    }
  } else {
    console.log('Migration already completed, skipping.');
  }
}
