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
    // set the primary key
    await this.kv.set(['messages', message.id], message);

    // set the secondary key
    await this.kv.set(['messagesByUserId', message.userId], message);
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
