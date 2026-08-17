/// <reference lib="deno.unstable" />
import { Debt, DebtDirection, DebtReminderSettings, DebtStatus } from '@work-boost/data-schemas';
import { Subscription } from '@work-boost/data-schemas';
import { Message } from '@work-boost/data-schemas';
import { User } from '@work-boost/data-schemas';
import { IndexKeys, PrimaryKeys, listIndexed } from './indexes.ts';

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export class Database {
  private static instance: Database;
  private _kv: Deno.Kv;

  private constructor(kv: Deno.Kv) {
    this._kv = kv;
  }

  static async init(): Promise<Database> {
    if (this.instance) return this.instance;

    const kv = await Deno.openKv();
    this.instance = new Database(kv);
    return this.instance;
  }

  /**
   * Create a test database instance with a provided KV store.
   * This is only intended for testing purposes.
   */
  static async createForTest(kv?: Deno.Kv): Promise<Database> {
    const testKv = kv || (await Deno.openKv(':memory:'));
    return new Database(testKv);
  }

  get kv(): Deno.Kv {
    return this._kv;
  }

  async close(): Promise<void> {
    await this.kv.close();
  }

  async store(user: User): Promise<void> {
    await this.kv.set(PrimaryKeys.user(user.id), user);
  }

  async getById(id: string): Promise<User | null> {
    const result = await this.kv.get<User>(PrimaryKeys.user(id));
    return result.value ?? null;
  }

  async getAllSubscribedUsers(): Promise<User[]> {
    const users = await listIndexed<User>(this.kv, ['users']);
    return users.filter((user) => user.subscribed);
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(PrimaryKeys.user(id));
  }

  async listUsers(): Promise<User[]> {
    const users = await listIndexed<User>(this.kv, ['users']);
    // ['users', userId, '_migrated'] migration markers store booleans — skip them
    return users.filter((user) => typeof user === 'object' && user !== null);
  }

  async storeDailyWorkMessage(message: Message): Promise<void> {
    // Store with primary key and user index for efficient lookups
    await this.kv
      .atomic()
      .set(PrimaryKeys.message(message.id), message)
      .set(IndexKeys.messageByUser(message.userId, message.id), message)
      .commit();
  }

  async getDailyWork(userId: string, date: Date): Promise<Message | undefined> {
    const messages = await this.getMessagesByUserId(userId);
    return messages.find((message) => isSameCalendarDay(message.date, date));
  }

  // Subscription methods for multi-platform support

  async getSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    const result = await this.kv.get(PrimaryKeys.subscription(userId));
    return result.value as Subscription | null;
  }

  async upsertSubscription(subscription: Subscription): Promise<void> {
    const isActive = subscription.enabled.length > 0;

    // Use atomic operation to update primary data and all indexes
    const atomic = this.kv
      .atomic()
      .set(PrimaryKeys.subscription(subscription.userId), subscription)
      .set(IndexKeys.subscriptionByUser(subscription.userId), subscription);

    // Maintain active subscriptions index
    if (isActive) {
      atomic.set(IndexKeys.activeSubscription(subscription.userId), subscription);
    } else {
      atomic.delete(IndexKeys.activeSubscription(subscription.userId));
    }

    await atomic.commit();
  }

  async setPlatformChatId(
    userId: string,
    platform: 'slack' | 'telegram',
    chatId: string,
  ): Promise<void> {
    const existing = await this.getSubscriptionByUserId(userId);
    if (existing) {
      existing.platforms[platform] = chatId;
      await this.upsertSubscription(existing);
    }
  }

  async disablePlatform(userId: string, platform: 'slack' | 'telegram'): Promise<void> {
    const existing = await this.getSubscriptionByUserId(userId);
    if (existing) {
      existing.enabled = existing.enabled.filter((p) => p !== platform);
      await this.upsertSubscription(existing);
    }
  }

  /**
   * Get all active subscriptions using the index for O(1) lookups
   */
  async getAllActiveSubscriptions(): Promise<Subscription[]> {
    const prefix = IndexKeys.activeSubscription('NO_USER').slice(0, -1); // Remove placeholder
    return listIndexed<Subscription>(this.kv, prefix);
  }

  /**
   * Get messages by user using indexed lookups, sorted by date (oldest first)
   */
  async getMessagesByUserId(userId: string): Promise<Message[]> {
    const messages = await listIndexed<Message>(this.kv, IndexKeys.messagesByUserPrefix(userId));
    return messages.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async getMessageById(id: string): Promise<Message | null> {
    const result = await this.kv.get<Message>(PrimaryKeys.message(id));
    return result.value ?? null;
  }

  /**
   * Get messages since a specific date for a user
   */
  async getMessagesByUserIdSince(userId: string, since: Date): Promise<Message[]> {
    const messages = await this.getMessagesByUserId(userId);
    return messages.filter((m) => m.date >= since);
  }

  /**
   * Get messages from today for a user
   */
  async getTodayMessagesByUserId(userId: string): Promise<Message[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.getMessagesByUserIdSince(userId, today);
  }

  /**
   * Get messages from last N days for a user
   */
  async getRecentMessagesByUserId(userId: string, days = 1): Promise<Message[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.getMessagesByUserIdSince(userId, cutoff);
  }

  async updateLastSentAt(userId: string, timestamp: Date): Promise<void> {
    const existing = await this.getSubscriptionByUserId(userId);
    if (existing) {
      existing.lastSentAt = timestamp;
      await this.upsertSubscription(existing);
    }
  }

  // Debt tracking methods

  /**
   * Create a new debt record with atomic index updates
   */
  async createDebt(debt: Omit<Debt, 'id' | 'createdAt' | 'updatedAt'>): Promise<Debt> {
    const id = crypto.randomUUID();
    const now = new Date();
    const newDebt: Debt = {
      id,
      ...debt,
      createdAt: now,
      updatedAt: now,
    };

    const atomic = this.kv
      .atomic()
      .set(PrimaryKeys.debt(id), newDebt)
      .set(IndexKeys.debtByUser(newDebt.userId, id), newDebt);

    // Add to unpaid index if status is pending
    if (newDebt.status === DebtStatus.PENDING) {
      atomic.set(IndexKeys.unpaidDebtByUser(newDebt.userId, id), newDebt);
    }

    await atomic.commit();
    return newDebt;
  }

  /**
   * Get a debt by its ID
   */
  async getDebtById(id: string): Promise<Debt | null> {
    const result = await this.kv.get(PrimaryKeys.debt(id));
    return result.value as Debt | null;
  }

  /**
   * Get all debts for a user, sorted by creation date (newest first)
   */
  async getDebtsByUserId(userId: string): Promise<Debt[]> {
    const debts = await listIndexed<Debt>(this.kv, IndexKeys.debtsByUserPrefix(userId));
    return debts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get only unpaid (pending) debts for a user
   */
  async getUnpaidDebtsByUserId(userId: string): Promise<Debt[]> {
    const debts = await listIndexed<Debt>(this.kv, IndexKeys.unpaidDebtsByUserPrefix(userId));
    return debts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get debts filtered by status, direction, or person
   */
  async getDebtsByUserIdFiltered(
    userId: string,
    options: {
      status?: DebtStatus;
      direction?: DebtDirection;
      personName?: string;
    },
  ): Promise<Debt[]> {
    const debts = await this.getDebtsByUserId(userId);
    return debts.filter((debt) => {
      if (options.status && debt.status !== options.status) return false;
      if (options.direction && debt.direction !== options.direction) return false;
      if (
        options.personName &&
        !debt.personName.toLowerCase().includes(options.personName.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Mark a debt as paid (settled)
   * Removes from unpaid index and updates the debt record
   */
  async settleDebt(debtId: string): Promise<Debt | null> {
    const existing = await this.getDebtById(debtId);
    if (!existing) return null;

    const updated: Debt = {
      ...existing,
      status: DebtStatus.PAID,
      paidAt: new Date(),
      updatedAt: new Date(),
    };

    await this.kv
      .atomic()
      .set(PrimaryKeys.debt(debtId), updated)
      .set(IndexKeys.debtByUser(existing.userId, debtId), updated)
      .delete(IndexKeys.unpaidDebtByUser(existing.userId, debtId))
      .commit();

    return updated;
  }

  /**
   * Update an existing debt (e.g., change amount, reason)
   */
  async updateDebt(
    debtId: string,
    updates: Partial<Omit<Debt, 'id' | 'userId' | 'createdAt'>>,
  ): Promise<Debt | null> {
    const existing = await this.getDebtById(debtId);
    if (!existing) return null;

    const wasPending = existing.status === DebtStatus.PENDING;
    const updated: Debt = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    const atomic = this.kv
      .atomic()
      .set(PrimaryKeys.debt(debtId), updated)
      .set(IndexKeys.debtByUser(existing.userId, debtId), updated);

    // Update unpaid index based on status change
    const isPending = updated.status === DebtStatus.PENDING;
    if (wasPending && !isPending) {
      atomic.delete(IndexKeys.unpaidDebtByUser(existing.userId, debtId));
    } else if (!wasPending && isPending) {
      atomic.set(IndexKeys.unpaidDebtByUser(existing.userId, debtId), updated);
    }

    await atomic.commit();
    return updated;
  }

  /**
   * Delete a debt record completely
   * Removes from all indexes
   */
  async deleteDebt(debtId: string): Promise<boolean> {
    const existing = await this.getDebtById(debtId);
    if (!existing) return false;

    await this.kv
      .atomic()
      .delete(PrimaryKeys.debt(debtId))
      .delete(IndexKeys.debtByUser(existing.userId, debtId))
      .delete(IndexKeys.unpaidDebtByUser(existing.userId, debtId))
      .commit();

    return true;
  }

  /**
   * Get debt reminder settings for a user
   */
  async getDebtReminderSettings(userId: string): Promise<DebtReminderSettings | null> {
    const result = await this.kv.get(IndexKeys.debtReminderSettings(userId));
    return result.value as DebtReminderSettings | null;
  }

  /**
   * Create or update debt reminder settings
   */
  async upsertDebtReminderSettings(
    settings: Omit<DebtReminderSettings, 'updatedAt'>,
  ): Promise<DebtReminderSettings> {
    const updated: DebtReminderSettings = {
      ...settings,
      updatedAt: new Date(),
    };
    await this.kv.set(IndexKeys.debtReminderSettings(settings.userId), updated);
    return updated;
  }

  /**
   * Get all users who have debt reminders enabled
   */
  async getAllDebtReminderUsers(): Promise<DebtReminderSettings[]> {
    const prefix = IndexKeys.debtReminderSettings('').slice(0, -1);
    const settings = await listIndexed<DebtReminderSettings>(this.kv, prefix);
    return settings.filter((setting) => setting.enabled);
  }

  /**
   * Update last reminder sent timestamp
   */
  async updateDebtReminderLastSent(userId: string): Promise<void> {
    const existing = await this.getDebtReminderSettings(userId);
    if (existing) {
      await this.upsertDebtReminderSettings({
        ...existing,
        lastReminderSentAt: new Date(),
      });
    }
  }

  /**
   * Calculate debt summary for a user
   */
  async getDebtSummary(userId: string): Promise<{
    totalLent: number;
    totalBorrowed: number;
    totalLentPaid: number;
    totalBorrowedPaid: number;
    pendingLentCount: number;
    pendingBorrowedCount: number;
  }> {
    const debts = await this.getDebtsByUserId(userId);

    const summary = {
      totalLent: 0,
      totalBorrowed: 0,
      totalLentPaid: 0,
      totalBorrowedPaid: 0,
      pendingLentCount: 0,
      pendingBorrowedCount: 0,
    };

    for (const debt of debts) {
      if (debt.direction === DebtDirection.LENT) {
        if (debt.status === DebtStatus.PAID) {
          summary.totalLentPaid += debt.amount;
        } else if (debt.status === DebtStatus.PENDING) {
          summary.totalLent += debt.amount;
          summary.pendingLentCount++;
        }
      } else {
        if (debt.status === DebtStatus.PAID) {
          summary.totalBorrowedPaid += debt.amount;
        } else if (debt.status === DebtStatus.PENDING) {
          summary.totalBorrowed += debt.amount;
          summary.pendingBorrowedCount++;
        }
      }
    }

    return summary;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.kv.get(['health']);
      return true;
    } catch {
      return false;
    }
  }
}
