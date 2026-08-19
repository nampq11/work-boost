
---

# TÀI LIỆU THIẾT KẾ PHẦN MỀM (SDD)
## Giai đoạn 1: Chuẩn hóa Domain & Tầng Dữ liệu Markdown-First (Local-First Architecture)

* **Dự án:** Work Boost
* **Kiến trúc:** Local-First, Single-User, Pure Markdown (File-System as Source of Truth)
* **Thành phần thực thi:** `packages/data-schemas`, `packages/data-provider`, `scripts/migrate-to-files.ts`

---

## 1. Kiến trúc Tổng quan (Architecture Overview)

Hệ thống lưu trữ chuyển từ Deno KV sang mô hình **Pure File Storage** trên máy tính cá nhân. Mọi dữ liệu (Báo cáo ngày, Khoản nợ, Cấu hình) đều là các file văn bản thuần túy nằm tại thư mục chuẩn của hệ điều hành `~/.workboost/workspace`.

```text
┌──────────────────────────────────────────────────────────────────┐
│                    Application / Bot Layer                       │
│             (Telegram / Slack / Agent Brain / CLI)               │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      packages/data-provider                      │
│  ┌───────────────────────┐ ┌───────────────────┐ ┌─────────────┐ │
│  │  DailyWorkRepository  │ │   DebtRepository  │ │ConfigManager│ │
│  └───────────┬───────────┘ └─────────┬─────────┘ └──────┬──────┘ │
│              │                       │                  │        │
│              ▼                       ▼                  │        │
│  ┌─────────────────────────────────────────────┐        │        │
│  │           Markdown Engine (AST/YAML)        │        │        │
│  └───────────────────────┬─────────────────────┘        │        │
│                          │                              │        │
│                          ▼                              │        │
│  ┌─────────────────────────────────────────────┐        │        │
│  │  WorkspaceFS (Mutex Lock + Atomic Writer)   │◄───────┘        │
│  └───────────────────────┬─────────────────────┘                 │
│                          │                                       │
│                          ▼ (Real-time Watcher)                   │
│  ┌─────────────────────────────────────────────┐                 │
│  │     WorkspaceWatcher (Deno.watchFs ngầm)    │                 │
│  └─────────────────────────────────────────────┘                 │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼ (Direct File I/O)
     ┌───────────────────────────────────────────────────┐
     │      Local Disk (~/.workboost/workspace/)         │
     │      ├── .workboost/config.json                   │
     │      ├── daily/YYYY-MM-DD.md                      │
     │      └── debts/ (active & archive)                │
     └───────────────────────────────────────────────────┘
```

---

## 2. Đặc tả Cấu trúc Thư mục Workspace (Workspace Specification)

Thư mục mặc định: `~/.workboost/workspace` (Mac/Linux) hoặc `%APPDATA%/workboost/workspace` (Windows).

```text
~/.workboost/workspace/
├── .workboost/
│   └── config.json                   # Cấu hình Workspace, Bot Chat IDs, Reminder Settings
├── daily/
│   ├── 2026-08-18.md                 # Báo cáo ngày (Single-user)
│   └── 2026-08-19.md
└── debts/
    ├── john-doe-8f3a.md              # Nợ đang chờ xử lý (Active)
    ├── sarah-c2d1.md
    └── archive/
        └── mike-b9e4.md              # Nợ đã thanh toán (Paid)
```

---

## 3. Thiết kế Schemas (`packages/data-schemas`)

Toàn bộ thời gian được chuẩn hóa sang **ISO 8601 String** (`z.string().datetime()`).

### 3.1. File `packages/data-schemas/src/config.ts`
```typescript
import { z } from 'zod';

export const WorkspaceConfigSchema = z.object({
  version: z.literal(1).default(1),
  workspaceName: z.string().default('My WorkBoost'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  
  // Tích hợp thông tin nền tảng (Thay thế Subscription trong KV)
  platforms: z.object({
    slack: z.object({
      enabled: z.boolean().default(false),
      channelId: z.string().optional(),
      userId: z.string().optional(),
    }).default({ enabled: false }),
    telegram: z.object({
      enabled: z.boolean().default(false),
      chatId: z.string().optional(),
    }).default({ enabled: false }),
  }).default({}),

  // Cấu hình nhắc nợ tự động
  debtReminder: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['weekly', 'monthly', 'never']).default('weekly'),
    weeklyDay: z.number().min(1).max(7).default(1), // Thứ 2
    monthlyDay: z.number().min(1).max(28).default(1), // Ngày 1 hàng tháng
    reminderHour: z.number().min(0).max(23).default(9),
    lastSentAt: z.string().datetime().nullable().default(null),
  }).default({}),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
```

### 3.2. File `packages/data-schemas/src/debt.ts`
```typescript
import { z } from 'zod';

export enum DebtDirection {
  LENT = 'lent',
  BORROWED = 'borrowed',
}

export enum DebtStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export const DebtFrontmatterSchema = z.object({
  id: z.string().uuid(),
  direction: z.nativeEnum(DebtDirection),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  personName: z.string().min(1),
  status: z.nativeEnum(DebtStatus).default(DebtStatus.PENDING),
  debtDate: z.string(), // YYYY-MM-DD
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable().default(null),
});

export type DebtFrontmatter = z.infer<typeof DebtFrontmatterSchema>;

export interface DebtDocument {
  frontmatter: DebtFrontmatter;
  reason: string; // Lý do nợ nằm trọn vẹn ở Markdown Body
  filePath: string;
}

export interface DebtSummary {
  totalLent: number;
  totalBorrowed: number;
  pendingLentCount: number;
  pendingBorrowedCount: number;
  netPosition: number;
  currencies: Record<string, { lent: number; borrowed: number }>;
}
```

### 3.3. File `packages/data-schemas/src/agent.ts` (Daily Work)
```typescript
import { z } from 'zod';

export interface TaskItem {
  project: string;
  task: string;
}

export interface DailyWorkReport {
  completed: TaskItem[];
  incomplete: TaskItem[];
  planned: TaskItem[];
}

export const DailyWorkFrontmatterSchema = z.object({
  id: z.string(), // daily_YYYY-MM-DD
  date: z.string(), // YYYY-MM-DD
  status: z.enum(['draft', 'completed']).default('completed'),
  updatedAt: z.string().datetime(),
});

export type DailyWorkFrontmatter = z.infer<typeof DailyWorkFrontmatterSchema>;

export interface DailyWorkDocument {
  frontmatter: DailyWorkFrontmatter;
  report: DailyWorkReport;
  customSections: string; // Lưu giữ các ghi chú tự do ngoài 3 mục chính
  rawMarkdown: string;
  filePath: string;
}
```

---

## 4. Thiết kế Tầng Data Provider (`packages/data-provider`)

### 4.1. Bộ xử lý an toàn Hệ thống Tệp: `WorkspaceFS`
*Tính năng:* Quản lý đường dẫn chuẩn OS, chống Path Traversal qua `Deno.realPath`, ghi đè nguyên tử (Atomic write), và tích hợp Mutex Lock chống Race Condition.

```typescript
// packages/data-provider/src/fs/workspace-fs.ts
import { ensureDir } from '@std/fs';
import { dirname, join, relative, resolve } from '@std/path';

export class WorkspaceFS {
  private rootPath: string;
  private writeLocks: Map<string, Promise<void>> = new Map();

  constructor(customRoot?: string) {
    if (customRoot) {
      this.rootPath = resolve(customRoot);
    } else {
      const home = Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '.';
      this.rootPath = resolve(join(home, '.workboost', 'workspace'));
    }
  }

  get root(): string {
    return this.rootPath;
  }

  async init(): Promise<void> {
    await ensureDir(this.rootPath);
    await ensureDir(join(this.rootPath, '.workboost'));
    await ensureDir(join(this.rootPath, 'daily'));
    await ensureDir(join(this.rootPath, 'debts'));
    await ensureDir(join(this.rootPath, 'debts', 'archive'));
  }

  assertInside(relPath: string): string {
    const fullPath = resolve(this.rootPath, relPath);
    const rel = relative(this.rootPath, fullPath);
    if (rel.startsWith('..') || resolve(fullPath) !== fullPath) {
      throw new Error(`Access Denied: Path escape detected -> ${relPath}`);
    }
    return fullPath;
  }

  /**
   * Mutex lock theo từng đường dẫn file để tránh Race Condition
   */
  async withLock<T>(relPath: string, task: () => Promise<T>): Promise<T> {
    const fullPath = this.assertInside(relPath);
    while (this.writeLocks.has(fullPath)) {
      await this.writeLocks.get(fullPath);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((r) => (resolveLock = r));
    this.writeLocks.set(fullPath, lockPromise);
    try {
      return await task();
    } finally {
      this.writeLocks.delete(fullPath);
      resolveLock();
    }
  }

  async readText(relPath: string): Promise<string> {
    const fullPath = this.assertInside(relPath);
    return await Deno.readTextFile(fullPath);
  }

  async writeTextAtomic(relPath: string, content: string): Promise<void> {
    return await this.withLock(relPath, async () => {
      const fullPath = this.assertInside(relPath);
      await ensureDir(dirname(fullPath));

      const tempPath = `${fullPath}.${crypto.randomUUID()}.tmp`;
      const bytes = new TextEncoder().encode(content);
      await Deno.writeFile(tempPath, bytes);

      try {
        await Deno.rename(tempPath, fullPath);
      } catch {
        // Fallback cho Windows nếu file đích đang bị lock bởi OS
        await Deno.copyFile(tempPath, fullPath);
        await Deno.remove(tempPath);
      }
    });
  }

  async move(fromRelPath: string, toRelPath: string): Promise<void> {
    const fromFull = this.assertInside(fromRelPath);
    const toFull = this.assertInside(toRelPath);
    await ensureDir(dirname(toFull));
    await Deno.rename(fromFull, toFull);
  }

  async listFiles(relDir: string): Promise<string[]> {
    const fullDir = this.assertInside(relDir);
    const files: string[] = [];
    try {
      for await (const entry of Deno.readDir(fullDir)) {
        if (entry.isFile && entry.name.endsWith('.md')) {
          files.push(join(relDir, entry.name));
        }
      }
    } catch {
      return [];
    }
    return files;
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await Deno.stat(this.assertInside(relPath));
      return true;
    } catch {
      return false;
    }
  }
}
```

---

### 4.2. Bộ phân tích Markdown & Bảo toàn Section: `MarkdownEngine`
*Tính năng:* Tách/ghép YAML Frontmatter, giữ nguyên các section tùy biến ngoài 3 mục chính của báo cáo ngày.

```typescript
// packages/data-provider/src/markdown/markdown-engine.ts
import { extract, test } from '@std/front-matter/yaml';
import { stringify } from '@std/yaml';
import type { DailyWorkReport, TaskItem } from '@work-boost/data-schemas';

export class MarkdownEngine {
  static parse<T>(rawContent: string): { frontmatter: T; body: string } {
    if (!test(rawContent)) {
      return { frontmatter: {} as T, body: rawContent.trim() };
    }
    const extracted = extract<T>(rawContent);
    return {
      frontmatter: extracted.attrs,
      body: extracted.body.trim(),
    };
  }

  static stringify<T extends Record<string, unknown>>(frontmatter: T, body: string): string {
    const yaml = stringify(frontmatter).trim();
    return `---\n${yaml}\n---\n\n${body.trim()}\n`;
  }

  /**
   * Tách và giữ nguyên nội dung bổ sung (custom notes/images) của người dùng
   */
  static parseDailyReport(body: string): { report: DailyWorkReport; customSections: string } {
    const report: DailyWorkReport = { completed: [], incomplete: [], planned: [] };
    const customLines: string[] = [];
    
    const lines = body.split('\n');
    let currentSection: 'completed' | 'incomplete' | 'planned' | 'custom' = 'custom';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('### 1.') || trimmed.toLowerCase().includes('việc hoàn thành')) {
        currentSection = 'completed';
      } else if (trimmed.startsWith('### 2.') || trimmed.toLowerCase().includes('chưa hoàn thành')) {
        currentSection = 'incomplete';
      } else if (trimmed.startsWith('### 3.') || trimmed.toLowerCase().includes('dự định làm')) {
        currentSection = 'planned';
      } else if (trimmed.startsWith('###') && currentSection !== 'custom') {
        currentSection = 'custom';
        customLines.push(line);
      } else if (currentSection === 'custom') {
        customLines.push(line);
      } else if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
        const taskText = trimmed.replace(/^[-•*]\s*/, '');
        if (taskText.toLowerCase() === 'n/a' || !taskText) continue;

        // Parse "**PROJECT**: Task description"
        const match = taskText.match(/^\*\*([^*]+)\*\*:\s*(.*)$/) || taskText.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          report[currentSection].push({ project: match[1].trim(), task: match[2].trim() });
        } else {
          report[currentSection].push({ project: 'INBOX', task: taskText });
        }
      }
    }

    return { report, customSections: customLines.join('\n').trim() };
  }

  static formatDailyReport(report: DailyWorkReport, customSections = ''): string {
    const formatSection = (tasks: TaskItem[]) => {
      if (!tasks || tasks.length === 0) return '- N/A';
      return tasks.map((t) => `- **${t.project || 'INBOX'}**: ${t.task}`).join('\n');
    };

    let result =
      `### 1. Việc hoàn thành hôm trước?\n${formatSection(report.completed)}\n\n` +
      `### 2. Việc dự định làm nhưng chưa hoàn thành?\n${formatSection(report.incomplete)}\n\n` +
      `### 3. Việc dự định làm hôm nay?\n${formatSection(report.planned)}`;

    if (customSections.trim()) {
      result += `\n\n${customSections.trim()}`;
    }

    return result;
  }
}
```

---

### 4.3. Quản lý Cấu hình Workspace: `WorkspaceConfigManager`
```typescript
// packages/data-provider/src/repositories/config-manager.ts
import { WorkspaceConfig, WorkspaceConfigSchema } from '@work-boost/data-schemas';
import { WorkspaceFS } from '../fs/workspace-fs.ts';

const CONFIG_PATH = '.workboost/config.json';

export class WorkspaceConfigManager {
  private configCache: WorkspaceConfig | null = null;

  constructor(private fs: WorkspaceFS) {}

  async load(): Promise<WorkspaceConfig> {
    if (this.configCache) return this.configCache;

    if (!(await this.fs.exists(CONFIG_PATH))) {
      const now = new Date().toISOString();
      const initial = WorkspaceConfigSchema.parse({
        createdAt: now,
        updatedAt: now,
      });
      await this.save(initial);
      return initial;
    }

    const raw = await this.fs.readText(CONFIG_PATH);
    this.configCache = WorkspaceConfigSchema.parse(JSON.parse(raw));
    return this.configCache;
  }

  async save(config: WorkspaceConfig): Promise<void> {
    config.updatedAt = new Date().toISOString();
    const validated = WorkspaceConfigSchema.parse(config);
    await this.fs.writeTextAtomic(CONFIG_PATH, JSON.stringify(validated, null, 2));
    this.configCache = validated;
  }
}
```

---

### 4.4. Kho lưu trữ Báo cáo Ngày: `DailyWorkRepository`
```typescript
// packages/data-provider/src/repositories/daily-work-repository.ts
import { DailyWorkDocument, DailyWorkFrontmatter, DailyWorkFrontmatterSchema, DailyWorkReport } from '@work-boost/data-schemas';
import { WorkspaceFS } from '../fs/workspace-fs.ts';
import { MarkdownEngine } from '../markdown/markdown-engine.ts';

export class DailyWorkRepository {
  constructor(private fs: WorkspaceFS) {}

  private getFilePath(dateStr: string): string {
    return `daily/${dateStr}.md`;
  }

  async save(dateStr: string, report: DailyWorkReport): Promise<DailyWorkDocument> {
    const filePath = this.getFilePath(dateStr);
    let customSections = '';

    // Nếu file đã tồn tại, giữ nguyên các section tùy biến của người dùng
    if (await this.fs.exists(filePath)) {
      const existing = await this.get(dateStr);
      if (existing) customSections = existing.customSections;
    }

    const frontmatter: DailyWorkFrontmatter = {
      id: `daily_${dateStr}`,
      date: dateStr,
      status: 'completed',
      updatedAt: new Date().toISOString(),
    };

    const body = MarkdownEngine.formatDailyReport(report, customSections);
    const rawMarkdown = MarkdownEngine.stringify(frontmatter, body);

    await this.fs.writeTextAtomic(filePath, rawMarkdown);

    return { frontmatter, report, customSections, rawMarkdown, filePath };
  }

  async get(dateStr: string): Promise<DailyWorkDocument | null> {
    const filePath = this.getFilePath(dateStr);
    if (!(await this.fs.exists(filePath))) return null;

    const rawMarkdown = await this.fs.readText(filePath);
    const { frontmatter, body } = MarkdownEngine.parse<DailyWorkFrontmatter>(rawMarkdown);
    const validatedFm = DailyWorkFrontmatterSchema.parse(frontmatter);
    const { report, customSections } = MarkdownEngine.parseDailyReport(body);

    return { frontmatter: validatedFm, report, customSections, rawMarkdown, filePath };
  }
}
```

---

### 4.5. Kho lưu trữ Sổ nợ: `DebtRepository`
*Tính năng:* Sinh slug tên file dễ đọc (`debts/john-doe-8f3a.md`), chuyển file sang `debts/archive/` khi thanh toán xong (`settle`), và tính toán `DebtSummary` on-the-fly.

```typescript
// packages/data-provider/src/repositories/debt-repository.ts
import { DebtDirection, DebtDocument, DebtFilterOptions, DebtFrontmatter, DebtFrontmatterSchema, DebtStatus, DebtSummary } from '@work-boost/data-schemas';
import { basename, join } from '@std/path';
import { WorkspaceFS } from '../fs/workspace-fs.ts';
import { MarkdownEngine } from '../markdown/markdown-engine.ts';

export class DebtRepository {
  constructor(private fs: WorkspaceFS) {}

  private generateSlug(personName: string, id: string): string {
    const cleanName = personName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'debt';
    const shortId = id.slice(0, 4);
    return `${cleanName}-${shortId}.md`;
  }

  async create(data: {
    direction: DebtDirection;
    amount: number;
    currency?: string;
    personName: string;
    reason?: string;
    debtDate?: string;
  }): Promise<DebtDocument> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const frontmatter: DebtFrontmatter = {
      id,
      direction: data.direction,
      amount: data.amount,
      currency: data.currency || 'USD',
      personName: data.personName,
      status: DebtStatus.PENDING,
      debtDate: data.debtDate || now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
      paidAt: null,
    };

    const fileName = this.generateSlug(data.personName, id);
    const filePath = join('debts', fileName);
    const rawMarkdown = MarkdownEngine.stringify(frontmatter, data.reason || '');

    await this.fs.writeTextAtomic(filePath, rawMarkdown);

    return { frontmatter, reason: data.reason || '', filePath };
  }

  async getById(debtId: string): Promise<DebtDocument | null> {
    const allDebts = await this.listAll();
    return allDebts.find((d) => d.frontmatter.id === debtId) || null;
  }

  async listAll(includeArchived = false): Promise<DebtDocument[]> {
    const activePaths = await this.fs.listFiles('debts');
    const archivePaths = includeArchived ? await this.fs.listFiles('debts/archive') : [];
    const allPaths = [...activePaths, ...archivePaths];

    const results: DebtDocument[] = [];
    for (const p of allPaths) {
      try {
        const raw = await this.fs.readText(p);
        const { frontmatter, body } = MarkdownEngine.parse<DebtFrontmatter>(raw);
        results.push({
          frontmatter: DebtFrontmatterSchema.parse(frontmatter),
          reason: body,
          filePath: p,
        });
      } catch {
        // Bỏ qua file lỗi định dạng
      }
    }
    return results.sort((a, b) => b.frontmatter.createdAt.localeCompare(a.frontmatter.createdAt));
  }

  async filter(options: DebtFilterOptions): Promise<DebtDocument[]> {
    const all = await this.listAll(options.status === DebtStatus.PAID);
    return all.filter((doc) => {
      const fm = doc.frontmatter;
      if (options.status && fm.status !== options.status) return false;
      if (options.direction && fm.direction !== options.direction) return false;
      if (options.personName && !fm.personName.toLowerCase().includes(options.personName.toLowerCase())) {
        return false;
      }
      return true;
    }).slice(0, options.limit || 100);
  }

  /**
   * Đánh dấu đã trả và tự động chuyển file vào thư mục debts/archive/
   */
  async settle(debtId: string): Promise<DebtDocument | null> {
    const debt = await this.getById(debtId);
    if (!debt || debt.frontmatter.status === DebtStatus.PAID) return null;

    const now = new Date().toISOString();
    debt.frontmatter.status = DebtStatus.PAID;
    debt.frontmatter.paidAt = now;
    debt.frontmatter.updatedAt = now;

    const updatedRaw = MarkdownEngine.stringify(debt.frontmatter, debt.reason);
    
    // Ghi lại nội dung đã paid
    await this.fs.writeTextAtomic(debt.filePath, updatedRaw);

    // Di chuyển sang debts/archive/
    const fileName = basename(debt.filePath);
    const archivePath = join('debts', 'archive', fileName);
    await this.fs.move(debt.filePath, archivePath);
    debt.filePath = archivePath;

    return debt;
  }

  async getSummary(): Promise<DebtSummary> {
    const activeDebts = await this.filter({ status: DebtStatus.PENDING });
    const summary: DebtSummary = {
      totalLent: 0,
      totalBorrowed: 0,
      pendingLentCount: 0,
      pendingBorrowedCount: 0,
      netPosition: 0,
      currencies: {},
    };

    for (const d of activeDebts) {
      const { amount, currency, direction } = d.frontmatter;
      if (!summary.currencies[currency]) {
        summary.currencies[currency] = { lent: 0, borrowed: 0 };
      }

      if (direction === DebtDirection.LENT) {
        summary.totalLent += amount;
        summary.pendingLentCount++;
        summary.currencies[currency].lent += amount;
      } else {
        summary.totalBorrowed += amount;
        summary.pendingBorrowedCount++;
        summary.currencies[currency].borrowed += amount;
      }
    }

    summary.netPosition = summary.totalLent - summary.totalBorrowed;
    return summary;
  }
}
```

---

### 4.6. Lắng nghe thay đổi ổ đĩa theo thời gian thực: `WorkspaceWatcher`
```typescript
// packages/data-provider/src/fs/workspace-watcher.ts
import { logger } from '@work-boost/shared/logger/logger.ts';
import { WorkspaceFS } from './workspace-fs.ts';

export class WorkspaceWatcher {
  private watcher: Deno.FsWatcher | null = null;

  constructor(
    private fs: WorkspaceFS,
    private onChange: (paths: string[]) => void,
  ) {}

  start(): void {
    try {
      this.watcher = Deno.watchFs(this.fs.root, { recursive: true });
      (async () => {
        for await (const event of this.watcher!) {
          if (['create', 'modify', 'remove'].includes(event.kind)) {
            const mdPaths = event.paths.filter((p) => p.endsWith('.md') || p.endsWith('.json'));
            if (mdPaths.length > 0) {
              this.onChange(mdPaths);
            }
          }
        }
      })();
      logger.info(`Workspace Watcher started at: ${this.fs.root}`);
    } catch (err) {
      logger.error('Failed to start Workspace Watcher', { error: err });
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
```

---

## 5. Kế hoạch Di trú Dữ liệu CLI (`scripts/migrate-to-files.ts`)

Lệnh CLI độc lập để chuyển toàn bộ dữ liệu từ Deno KV cũ sang Workspace Markdown mới.

```typescript
// scripts/migrate-to-files.ts
import { WorkspaceFS } from '../packages/data-provider/src/fs/workspace-fs.ts';
import { DailyWorkRepository } from '../packages/data-provider/src/repositories/daily-work-repository.ts';
import { DebtRepository } from '../packages/data-provider/src/repositories/debt-repository.ts';
import { WorkspaceConfigManager } from '../packages/data-provider/src/repositories/config-manager.ts';
import { Debt, DebtStatus, Message, Subscription } from '@work-boost/data-schemas';

async function runMigration() {
  console.log('🚀 Bắt đầu di trú dữ liệu Deno KV -> Markdown Workspace...');

  const kv = await Deno.openKv();
  const fs = new WorkspaceFS();
  await fs.init();

  const configMgr = new WorkspaceConfigManager(fs);
  const dailyRepo = new DailyWorkRepository(fs);
  const debtRepo = new DebtRepository(fs);

  // 1. Migrate Subscriptions & Config
  console.log('📦 Di trú cấu hình và subscriptions...');
  const subEntries = kv.list<Subscription>({ prefix: ['subscriptions'] });
  for await (const entry of subEntries) {
    const sub = entry.value;
    const config = await configMgr.load();
    if (sub.platforms.slack) {
      config.platforms.slack = { enabled: sub.enabled.includes('slack'), userId: sub.platforms.slack };
    }
    if (sub.platforms.telegram) {
      config.platforms.telegram = { enabled: sub.enabled.includes('telegram'), chatId: sub.platforms.telegram };
    }
    await configMgr.save(config);
    break; // Single-user: lấy profile đầu tiên
  }

  // 2. Migrate Debts
  console.log('💵 Di trú danh sách nợ...');
  const debtEntries = kv.list<Debt>({ prefix: ['debts'] });
  let debtCount = 0;
  for await (const entry of debtEntries) {
    const d = entry.value;
    const doc = await debtRepo.create({
      direction: d.direction,
      amount: d.amount,
      currency: d.currency,
      personName: d.personName,
      reason: d.reason,
      debtDate: d.debtDate ? new Date(d.debtDate).toISOString().slice(0, 10) : undefined,
    });
    if (d.status === DebtStatus.PAID) {
      await debtRepo.settle(doc.frontmatter.id);
    }
    debtCount++;
  }
  console.log(`✅ Đã di trú ${debtCount} khoản nợ.`);

  // 3. Migrate Daily Messages
  console.log('📝 Di trú báo cáo hàng ngày...');
  const msgEntries = kv.list<Message>({ prefix: ['messages'] });
  let msgCount = 0;
  for await (const entry of msgEntries) {
    const msg = entry.value;
    const dateStr = new Date(msg.date).toISOString().slice(0, 10);
    await dailyRepo.save(dateStr, {
      completed: [{ project: 'LEGACY', task: msg.content }],
      incomplete: [],
      planned: [],
    });
    msgCount++;
  }
  console.log(`✅ Đã di trú ${msgCount} báo cáo ngày.`);

  await kv.close();
  console.log(`🎉 Di trú thành công! Dữ liệu đã sẵn sàng tại: ${fs.root}`);
}

if (import.meta.main) {
  await runMigration();
}
```

Thêm task vào `deno.json`:
```json
"tasks": {
  "migrate:to-files": "deno run --allow-all --unstable-kv scripts/migrate-to-files.ts"
}
```

---

## 6. Kế hoạch Kiểm thử Tự động (Unit Tests)

Bộ kiểm thử hoàn chỉnh đảm bảo không có rủi ro bảo mật hay mất dữ liệu:

1. **`tests/provider/workspace_fs_test.ts`**:
   - Chặn đứng Path Traversal (`../../etc/passwd` ➔ Ném lỗi `Access Denied`).
   - Kiểm tra `withLock` ngăn chặn ghi đồng thời (Concurrency Test).
   - Kiểm tra Atomic write trên file tạm.
2. **`tests/provider/markdown_engine_test.ts`**:
   - Kiểm tra Round-trip Serialization (Frontmatter Object ➔ String ➔ Parse ngược lại 100% khớp).
   - Kiểm tra bảo toàn các section tùy biến (`customSections`) khi parse và lưu báo cáo ngày.
3. **`tests/provider/debt_repository_test.ts`**:
   - Tạo nợ mới: File xuất hiện đúng dạng `debts/<slug>.md`.
   - Settle nợ: File tự động di chuyển vào `debts/archive/<slug>.md`.
   - Kiểm tra tính toán `getSummary()` chuẩn xác theo từng loại tiền tệ.
4. **`tests/provider/daily_work_repository_test.ts`**:
   - Lưu báo cáo ngày ➔ Đọc lại đúng file `daily/YYYY-MM-DD.md`.
