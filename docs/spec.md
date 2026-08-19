# TÀI LIỆU THIẾT KẾ PHẦN MỀM (SDD) - GIAI ĐOẠN 2
## Nâng cấp AI Agent Loop & Chuẩn hóa Kiến trúc Workspace (@work-boost/brain)

* **Dự án:** Work Boost
* **Phiên bản:** 2.0 (Markdown-Native & Monorepo Standardized)
* **Thành phần thực thi:** `packages/brain`, `packages/data-provider`, `packages/data-schemas`, `packages/services`, `apps/api`

---

## 1. Mục tiêu & Quyết định Kiến trúc (Architectural Decisions)

1. **Bộ công cụ Nguyên tử (Atomic Tools):** Thay thế các mega-tool bằng các tool nhỏ gọn, đơn trách nhiệm (`create_debt`, `settle_debt`, `list_debts`, `get_debt_summary`, `delete_debt`, `save_daily_work`, `get_daily_work`, `list_daily_dates`, `get_current_time`, `read_workspace_file`, `list_workspace_files`).
2. **Đơn nhất hóa DataLayer (Singleton Instance):** Toàn bộ ứng dụng dùng chung 1 instance `DataLayer` duy nhất; `Database` facade dùng lại instance này để triệt tiêu xung đột Mutex Lock và ghi đĩa.
3. **Thực thi trực tiếp + Phản hồi chi tiết (Direct Execution):** Agent gọi tool thực thi ngay trên file Markdown, trả về tóm tắt rõ ràng và đường dẫn file để người dùng nắm bắt.
4. **Hợp nhất kênh tương tác (Unified Agent Interface):** Telegram, Slack và API đều tương tác qua `agent.stream()`. Bỏ các hàm parse legacy (`parseDebtEntry`, `generateDailyWorkReport`).
5. **Timezone & Thời gian thực:** Bổ sung tool `get_current_time` và cấu hình `timezone` (mặc định `Asia/Ho_Chi_Minh`) trong `.workboost/config.json`.
6. **Audit Trail trong Frontmatter:** Bổ sung trường `updatedBy: 'telegram' | 'slack' | 'agent' | 'user'` vào `Debt` và `DailyWork`.
7. **Bảo mật & Tối ưu Token:** `get_daily_work` mặc định trả về JSON gọn gàng; `read_workspace_file` chỉ đọc file `.md`, `.json`, `.txt` dung lượng `< 1MB`.
8. **Tạm thời gỡ bỏ Langfuse Tracing:** Giảm tải độ phức tạp và tập trung vào hiệu năng Agent Loop.

---

## 2. Quy chuẩn Tổ chức Thư mục & Naming Conventions

### 2.1. Cấu trúc Thư mục Mục tiêu (Target Monorepo Layout)
```text
work-boost/
├── 📁 apps/
│   └── 📁 api/                      # [CHUYỂN TỪ /api VÀO] REST API & Webhooks Server
│       ├── 📁 src/
│       │   ├── 📄 bootstrap.ts      # [CHUYỂN VỀ ĐÂY] Wire Dependency Injection
│       │   ├── 📄 main.ts
│       │   └── 📄 server.ts
│       └── 📄 deno.json
│
├── 📁 packages/
│   ├── 📁 brain/                    # AI Agent Core (@work-boost/brain)
│   │   ├── 📁 src/
│   │   │   ├── 📁 tools/            # Atomic Workspace Tools
│   │   │   │   ├── 📄 debt-tools.ts
│   │   │   │   ├── 📄 daily-work-tools.ts
│   │   │   │   ├── 📄 workspace-file-tools.ts
│   │   │   │   ├── 📄 time-tools.ts
│   │   │   │   └── 📄 index.ts
│   │   │   ├── 📄 brain.ts
│   │   │   ├── 📄 sessions.ts
│   │   │   └── 📄 llm.ts
│   │   ├── 📄 deno.json
│   │   └── 📄 mod.ts
│   │
│   ├── 📁 data-provider/            # Markdown Engine & Repositories (@work-boost/data-provider)
│   │   ├── 📁 src/
│   │   │   ├── 📁 fs/               # WorkspaceFS, Watcher
│   │   │   ├── 📁 markdown/         # MarkdownEngine
│   │   │   ├── 📁 repositories/     # DebtRepository, DailyWorkRepository, ConfigManager
│   │   │   └── 📄 database.ts       # Singleton Compatibility Facade
│   │   ├── 📄 deno.json
│   │   └── 📄 mod.ts
│   │
│   ├── 📁 data-schemas/             # Zod Schemas & Domain Types (@work-boost/data-schemas)
│   │   ├── 📁 src/
│   │   │   ├── 📄 config.ts
│   │   │   ├── 📄 debt.ts
│   │   │   ├── 📄 agent.ts
│   │   │   └── 📄 subscription.ts
│   │   └── 📄 mod.ts
│   │
│   ├── 📁 services/                 # Bots & Platform Integration (@work-boost/services)
│   │   ├── 📁 src/
│   │   │   ├── 📁 telegram/         # TelegramService + Handlers
│   │   │   ├── 📁 slack/            # SlackService
│   │   │   ├── 📁 formatters/       # Message Formatters
│   │   │   └── 📁 scheduler/        # Deno Cron Jobs
│   │   └── 📄 mod.ts
│   │
│   └── 📁 shared/                   # Logger, Env Utilities
│
├── 📁 tests/                        # Toàn bộ test chuẩn hóa đuôi .test.ts
│   ├── 📁 entity/
│   │   └── 📄 debt.test.ts
│   ├── 📁 provider/
│   │   ├── 📄 markdown-engine.test.ts
│   │   └── 📄 workspace-fs.test.ts
│   └── 📁 services/
│       ├── 📁 agent/
│       │   ├── 📄 workspace-tools.test.ts
│       │   ├── 📄 llm.test.ts
│       │   └── 📄 sessions.test.ts
│       └── 📁 formatting/
│           ├── 📄 debt-slack-formatter.test.ts
│           └── 📄 debt-telegram-formatter.test.ts
│
├── 📁 docs/                         # Tài liệu kiến trúc & SDD
├── 📄 CONTEXT.md                    # Domain Glossary (Thuật ngữ chuẩn)
└── 📄 deno.json                     # Root workspace configuration
```

### 2.2. Quy tắc Đặt tên (Naming Rules)
* **Tên file code:** Luôn dùng `kebab-case.ts` (ví dụ: `daily-work-repository.ts`, `workspace-fs.ts`).
* **Tên file test:** Luôn dùng `kebab-case.test.ts` (ví dụ: `workspace-fs.test.ts`, `markdown-engine.test.ts`).
* **Tên Class & Service:** Dùng `PascalCase` và có hậu tố rõ ràng: `SlackService`, `TelegramService`.
* **Tên Tools của Agent:** Luôn dùng `snake_case` dạng `verb_noun` (ví dụ: `create_debt`, `settle_debt`, `save_daily_work`, `get_current_time`).

---

## 3. Cập nhật Schemas (`packages/data-schemas`)

### 3.1. `packages/data-schemas/src/config.ts`
```typescript
import { z } from 'zod';

export const WorkspaceConfigSchema = z.object({
  version: z.literal(1).default(1),
  workspaceName: z.string().default('My WorkBoost'),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  platforms: z.object({
    slack: z.object({
      enabled: z.boolean().default(false),
      channelId: z.string().optional(),
      userId: z.string().optional(),
      lastSentAt: z.string().datetime().nullable().default(null),
    }).default({ enabled: false }),
    telegram: z.object({
      enabled: z.boolean().default(false),
      chatId: z.string().optional(),
    }).default({ enabled: false }),
  }).default({ slack: { enabled: false }, telegram: { enabled: false } }),
  debtReminder: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['weekly', 'monthly', 'never']).default('weekly'),
    weeklyDay: z.number().min(1).max(7).default(1),
    monthlyDay: z.number().min(1).max(28).default(1),
    reminderHour: z.number().min(0).max(23).default(9),
    lastSentAt: z.string().datetime().nullable().default(null),
  }).default({ enabled: false, frequency: 'weekly', weeklyDay: 1, monthlyDay: 1, reminderHour: 9, lastSentAt: null }),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
```

### 3.2. `packages/data-schemas/src/debt.ts`
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
  currency: z.string().default('VND'),
  personName: z.string().min(1),
  status: z.nativeEnum(DebtStatus).default(DebtStatus.PENDING),
  debtDate: z.iso.date(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable().default(null),
  updatedBy: z.enum(['telegram', 'slack', 'agent', 'user']).default('agent'),
});

export type DebtFrontmatter = z.infer<typeof DebtFrontmatterSchema>;

export interface DebtDocument {
  frontmatter: DebtFrontmatter;
  reason: string;
  filePath: string;
}
```

### 3.3. `packages/data-schemas/src/agent.ts`
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
  date: z.iso.date(),
  status: z.enum(['draft', 'completed']).default('completed'),
  updatedAt: z.string().datetime(),
  updatedBy: z.enum(['telegram', 'slack', 'agent', 'user']).default('agent'),
});

export type DailyWorkFrontmatter = z.infer<typeof DailyWorkFrontmatterSchema>;

export interface DailyWorkDocument {
  frontmatter: DailyWorkFrontmatter;
  report: DailyWorkReport;
  customSections: string;
  rawMarkdown: string;
  filePath: string;
}
```

---

## 4. Tầng Dữ liệu Singleton (`packages/data-provider`)

Trong `packages/data-provider/src/database.ts`:
```typescript
export class Database {
  private static instance: Database;

  static async init(providedDataLayer?: DataLayer): Promise<Database> {
    if (this.instance) return this.instance;

    const dataLayer = providedDataLayer || createLocalDataLayer();
    await dataLayer.fs.init();
    await dataLayer.config.load();

    this.instance = new Database(dataLayer);
    return this.instance;
  }
}
```

---

## 5. Hệ thống Atomic Tools (`packages/brain/src/tools/`)

### 5.1. File `packages/brain/src/tools/time-tools.ts`
```typescript
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { ConfigManager } from '@work-boost/data-provider';

export function createGetCurrentTimeTool(configMgr: ConfigManager): AgentTool<any> {
  return {
    name: 'get_current_time',
    label: 'Get Current Time',
    description: 'Lấy ngày và giờ hiện tại theo Timezone đã cấu hình của Workspace.',
    parameters: Type.Object({}),
    execute: async () => {
      const config = await configMgr.load();
      const timezone = config.timezone || 'Asia/Ho_Chi_Minh';
      const now = new Date();
      
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const localTime = new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, timeStyle: 'full', dateStyle: 'full' }).format(now);

      return {
        content: [{ type: 'text', text: JSON.stringify({ currentDate: localDate, fullTime: localTime, timezone }) }],
        details: { localDate, localTime, timezone },
      };
    },
  };
}
```

### 5.2. File `packages/brain/src/tools/debt-tools.ts`
Chứa 5 tools nguyên tử:
1. `create_debt`: Nhận `{ personName, amount, currency, direction, reason, debtDate }`.
2. `list_debts`: Nhận `{ personName, status, direction }`.
3. `settle_debt`: Nhận `{ debtId }` (Agent gọi `list_debts` trước để lấy ID).
4. `get_debt_summary`: Tính toán vị thế ròng Net position.
5. `delete_debt`: Nhận `{ debtId }`.

### 5.3. File `packages/brain/src/tools/daily-work-tools.ts`
Chứa 3 tools nguyên tử:
1. `save_daily_work`: Nhận `{ date, completed, incomplete, planned }`.
2. `get_daily_work`: Nhận `{ date, includeRaw }` (mặc định trả về JSON).
3. `list_daily_dates`: Liệt kê các ngày đã có báo cáo.

### 5.4. File `packages/brain/src/tools/workspace-file-tools.ts`
Chứa 2 tools thao tác file:
1. `read_workspace_file`: Nhận `{ path }` (kiểm tra đuôi `.md`, `.json`, `.txt` và kích thước `< 1MB`).
2. `list_workspace_files`: Nhận `{ folder }`.

### 5.5. File `packages/brain/src/tools/index.ts`
```typescript
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { DataLayer } from '@work-boost/data-provider';
import { createGetCurrentTimeTool } from './time-tools.ts';
import {
  createCreateDebtTool,
  createDeleteDebtTool,
  createGetDebtSummaryTool,
  createListDebtsTool,
  createSettleDebtTool,
} from './debt-tools.ts';
import {
  createGetDailyWorkTool,
  createListDailyDatesTool,
  createSaveDailyWorkTool,
} from './daily-work-tools.ts';
import {
  createListWorkspaceFilesTool,
  createReadWorkspaceFileTool,
} from './workspace-file-tools.ts';

export function getWorkspaceTools(dataLayer: DataLayer): AgentTool<any>[] {
  return [
    createGetCurrentTimeTool(dataLayer.config),
    createCreateDebtTool(dataLayer.debts),
    createListDebtsTool(dataLayer.debts),
    createSettleDebtTool(dataLayer.debts),
    createGetDebtSummaryTool(dataLayer.debts),
    createDeleteDebtTool(dataLayer.debts),
    createSaveDailyWorkTool(dataLayer.dailyWork),
    createGetDailyWorkTool(dataLayer.dailyWork),
    createListDailyDatesTool(dataLayer.dailyWork),
    createReadWorkspaceFileTool(dataLayer.fs),
    createListWorkspaceFilesTool(dataLayer.fs),
  ];
}
```

---

## 6. Nâng cấp Core Brain (`packages/brain/src/brain.ts`)

### 6.1. System Prompt
```typescript
function buildWorkspaceSystemPrompt(platform?: string, chatId?: string): string {
  return `You are Work Boost — an intelligent AI assistant operating directly inside the user's Local-First Markdown Workspace.

Platform: ${platform || 'unknown'}
Chat ID: ${chatId || 'unknown'}

Operating Principles & Guidelines:
1. Workspace as Single Source of Truth: All user data (daily work reports, debts) are stored as local Markdown files.
2. Time Awareness: Always call 'get_current_time' if you need to determine today's date or resolve relative time terms like "hôm nay", "hôm qua", "tuần này".
3. Debt Management:
   - Creating debt: Normalize Vietnamese amounts (e.g. "50k" -> 50000, "1 củ" / "1 triệu" -> 1000000, "2 lít" -> 200000). Default currency is 'VND' unless specified otherwise.
   - Settling debt: If the user says "John đã trả nợ", first call 'list_debts' with personName='John' & status='pending' to find the debtId, then call 'settle_debt' with that debtId.
4. Daily Work Standup:
   - When user shares work progress, parse tasks into 3 distinct sections (Completed, Incomplete, Planned) with Project codes (e.g., **B4**, **UI**, **INBOX**) and call 'save_daily_work'.
5. Response Tone: Friendly, concise, professional Vietnamese. Always summarize the actions performed with Markdown formatting.`;
}
```

### 6.2. Interface `AgentPort` Tinh Gọn
```typescript
// packages/brain/src/ports/agent.ts
export interface AgentPort {
  stream(
    message: string,
    onChunk: (chunk: AgentStreamChunk) => void | Promise<void>,
    options?: AgentStreamOptions,
  ): Promise<AgentStreamResult>;

  createSession(sessionId?: string): Promise<string>;
  loadSession(sessionId: string): Promise<void>;
  removeSession(sessionId: string): Promise<boolean>;
  dispose(): void;
}
```

---

## 7. Khởi tạo Tập trung tại `apps/api/src/bootstrap.ts`

Chuyển `bootstrap.ts` từ `packages/services` về `apps/api/src/bootstrap.ts`:
```typescript
import { createDataLayer, Database } from '@work-boost/data-provider';
import { createBrain, type AgentPort } from '@work-boost/brain';
import { env } from '@work-boost/shared';
import { SlackService, TelegramService } from '@work-boost/services';

export interface Services {
  db: Database;
  agent: AgentPort;
  slack: SlackService;
  telegram: TelegramService;
}

export async function initializeServices(): Promise<Services> {
  // 1. Khởi tạo DataLayer duy nhất
  const dataLayer = createDataLayer();
  await dataLayer.fs.init();
  await dataLayer.config.load();

  // 2. Database facade dùng chung dataLayer
  const db = await Database.init(dataLayer);

  // 3. Khởi tạo Brain với Workspace Tools (Không Langfuse)
  const agent = createBrain({
    apiKey: env.get('GOOGLE_API_KEY') || '',
    dataLayer,
  });

  const slack = new SlackService();
  const telegram = new TelegramService(db, agent);

  return { db, agent, slack, telegram };
}
```

---

## 8. Kế hoạch Dọn dẹp & Triển khai (Checklist)

### 🧹 Bước 1: Dọn dẹp Code Rác & Chuẩn hóa Naming
- [ ] Xóa `packages/data-provider/src/indexes.ts`.
- [ ] Xóa `packages/data-provider/src/migrations/`.
- [ ] Xóa các file test rác ở root: `tests/test_agent.ts`, `tests/test_database.ts`, `tests/test_slack.ts`.
- [ ] Đổi tên `class Slack` thành `class SlackService` trong `packages/services/src/slack/slack.ts`.
- [ ] Đổi toàn bộ tên file trong `tests/` sang dạng `kebab-case.test.ts`.
- [ ] Chuyển thư mục `api/` thành `apps/api/` (cập nhật `deno.json` workspace).
- [ ] Chuyển `bootstrap.ts` sang `apps/api/src/bootstrap.ts`.

### ⚙️ Bước 2: Nâng cấp Schemas & Data Layer
- [ ] Thêm `timezone` vào `WorkspaceConfigSchema`.
- [ ] Thêm `updatedBy` vào `DebtFrontmatterSchema` và `DailyWorkFrontmatterSchema`.
- [ ] Sửa `Database.init(dataLayer)` nhận instance từ ngoài vào.

### 🧠 Bước 3: Triển khai Atomic Tools cho Brain
- [ ] Tạo `packages/brain/src/tools/time-tools.ts`.
- [ ] Tạo `packages/brain/src/tools/debt-tools.ts`.
- [ ] Tạo `packages/brain/src/tools/daily-work-tools.ts`.
- [ ] Tạo `packages/brain/src/tools/workspace-file-tools.ts`.
- [ ] Tạo `packages/brain/src/tools/index.ts` gom toàn bộ tools lại.
- [ ] Xóa bỏ thư mục `packages/brain/src/tools/database/` cũ.

### 🚀 Bước 4: Refactor Brain Core & Services
- [ ] Cập nhật `packages/brain/src/brain.ts` (gỡ bỏ Langfuse, nạp `dataLayer`, đổi system prompt, tinh gọn `AgentPort`).
- [ ] Cập nhật các Telegram handlers gọi `agent.stream()`.

### 🧪 Bước 5: Kiểm thử Toàn diện
- [ ] Viết `tests/services/agent/workspace-tools.test.ts`.
- [ ] Chạy `deno task test` và `deno task check` đảm bảo **Pass 100%**.
