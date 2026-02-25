/// <reference lib="deno.unstable" />
import { Debt, DebtDirection, DebtReminderSettings, DebtStatus } from '../../entity/debt.ts';
import { Subscription } from '../../entity/subscription.ts';
import { Message } from '../../entity/task.ts';
import { User } from '../../entity/user.ts';
import { IndexKeys, PrimaryKeys } from './indexes.ts';

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

  async store(user: User): Promise<void> {
    await this.kv.set(['users', user.id], user);
    console.log('Saved account!');
  }

  async getById(id: string): Promise<User | null> {
    const result = await this.kv.get(['users', id]);
    return result.value as User;
  }

  async getAllSubscribedUsers(): Promise<User[]> {
    const users: User[] = [];
    const entries = this.kv.list({ prefix: ['users'] });
    for await (const entry of entries) {
      const user = entry.value as User;
      if (user.subscribed) users.push(user);
    }

    return users;
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(['users', id]);
    console.log('Deleted account!');
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
    const listMessageByUserId = await this.kv.getMany<Message[]>([['messagesByUserId', userId]]);

    // filter by Date
    for (const message of listMessageByUserId) {
      if (message.value?.date.getDate() === date.getDate()) {
        return message.value as Message;
      }
    }
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
    const subscriptions: Subscription[] = [];
    // Use the active_subscriptions index instead of scanning all subscriptions
    const prefix = IndexKeys.activeSubscription('NO_USER').slice(0, -1); // Remove placeholder
    const entries = this.kv.list({ prefix });
    for await (const entry of entries) {
      subscriptions.push(entry.value as Subscription);
    }
    return subscriptions;
  }

  /**
   * Get messages by user using indexed lookups, sorted by date (oldest first)
   */
  async getMessagesByUserId(userId: string): Promise<Message[]> {
    const messages: Message[] = [];
    // Use the user-specific message index instead of scanning all messages
    const entries = this.kv.list({ prefix: IndexKeys.messagesByUserPrefix(userId) });
    for await (const entry of entries) {
      messages.push(entry.value as Message);
    }
    return messages.sort((a, b) => a.date.getTime() - b.date.getTime());
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
    const debts: Debt[] = [];
    const entries = this.kv.list({ prefix: IndexKeys.debtsByUserPrefix(userId) });
    for await (const entry of entries) {
      debts.push(entry.value as Debt);
    }
    return debts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get only unpaid (pending) debts for a user
   */
  async getUnpaidDebtsByUserId(userId: string): Promise<Debt[]> {
    const debts: Debt[] = [];
    const entries = this.kv.list({ prefix: IndexKeys.unpaidDebtsByUserPrefix(userId) });
    for await (const entry of entries) {
      debts.push(entry.value as Debt);
    }
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
    const settings: DebtReminderSettings[] = [];
    const prefix = IndexKeys.debtReminderSettings('').slice(0, -1);
    const entries = this.kv.list({ prefix });
    for await (const entry of entries) {
      const s = entry.value as DebtReminderSettings;
      if (s.enabled) {
        settings.push(s);
      }
    }
    return settings;
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
}

// export class TaskDB {
//     static async create(task: Omit<Task, "id">): Promise<Task>{
//         const id = generateId();
//         const now = new Date();
//         const newTask = {
//             id,
//             ...task,
//             createAt: now,
//             updateAt: now,
//         };

//         await kv.atomic()
//         .set(["tasks", id], newTask)
//         .set(["tasks_by_status", newTask.status, id], id)
//         .set(["tasks_by_user", newTask.createdBy, id], id)
//         .commit();

//         return newTask;
//     }

//     static async getById(id: string): Promise<Task | null> {
//         const result = await kv.get(["tasks", id]);
//         return result.value as Task;
//     }

//     static async getByStatus(status: string): Promise<Task[]> {
//         const tasks: Task[] = [];
//         const entries = kv.list({prefix: ["tasks_by_status", status]});

//         for await (const entry of entries) {
//             const task = await this.getById(entry.value as string);
//             if (task) tasks.push(task);
//         }

//         return tasks;
//     }

//     static async updateStatus(id: string, status: string): Promise<Task | null> {
//         const task = await this.getById(id);
//         if (!task) return null;

//         const updatedTask = {...task, status, updateAt: new Date()};
//         await kv.atomic()
//         .set(["tasks", id], updatedTask)
//         .set(["tasks_by_status", status, id], id)
//         .delete(["tasks_by_status", task.status, id])
//         .commit();

//         return updatedTask;
//     }
// }
