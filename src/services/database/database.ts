import { Subscription } from '../../entity/subscription.ts';
import { Message } from '../../entity/task.ts';
import { User } from '../../entity/user.ts';

export class Database {
  private static instance: Database;
  private kv: Deno.Kv;

  private constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  static async init(): Promise<Database> {
    if (this.instance) return this.instance;

    const kv = await Deno.openKv();
    this.instance = new Database(kv);
    return this.instance;
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
      .set(['messages', message.id], message)
      .set(['messages_by_user', message.userId, message.id], message)
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
    const result = await this.kv.get(['subscriptions', userId]);
    return result.value as Subscription | null;
  }

  async upsertSubscription(subscription: Subscription): Promise<void> {
    const isActive = subscription.enabled.length > 0;

    // Use atomic operation to update primary data and all indexes
    const atomic = this.kv
      .atomic()
      .set(['subscriptions', subscription.userId], subscription)
      .set(['subscriptions_by_user', subscription.userId], subscription);

    // Maintain active subscriptions index
    if (isActive) {
      atomic.set(['active_subscriptions', subscription.userId], subscription);
    } else {
      atomic.delete(['active_subscriptions', subscription.userId]);
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
    const entries = this.kv.list({ prefix: ['active_subscriptions'] });
    for await (const entry of entries) {
      subscriptions.push(entry.value as Subscription);
    }
    return subscriptions;
  }

  /**
   * Get messages by user using indexed lookups
   */
  async getMessagesByUserId(userId: string): Promise<Message[]> {
    const messages: Message[] = [];
    // Use the user-specific message index instead of scanning all messages
    const entries = this.kv.list({ prefix: ['messages_by_user', userId] });
    for await (const entry of entries) {
      messages.push(entry.value as Message);
    }
    return messages.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async updateLastSentAt(userId: string, timestamp: Date): Promise<void> {
    const existing = await this.getSubscriptionByUserId(userId);
    if (existing) {
      existing.lastSentAt = timestamp;
      await this.upsertSubscription(existing);
    }
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
