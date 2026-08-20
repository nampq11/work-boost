Dưới đây là bản **Specification hoàn chỉnh (Gồm cả PRODUCT SPEC và TECH SPEC)** cho hệ thống **Extension & Plugin Architecture** của Work Boost.

---

# 📦 SPEC: Work Boost Extension & Plugin Architecture

## PHẦN 1: PRODUCT SPECIFICATION (Đặc tả Chức năng & Trải nghiệm)

### 1. Tóm tắt (Summary)
Chuyển đổi toàn bộ các dịch vụ ngoại vi (Telegram Bot, Slack Bot, Cron Scheduler) từ dạng hardcode nguyên khối (`packages/services`) thành **Kiến trúc Extension/Plugin độc lập**. Hệ thống hỗ trợ nạp các **Built-in Extensions** (tại thư mục gốc `extensions/`) và tự động nạp các **Custom Plugins** do người dùng hoặc AI Agent tự viết (tại thư mục `~/.workboost/plugins/`).

---

### 2. Các luồng trải nghiệm chính (User & Developer Flows)

```
                    ┌───────────────────────────────────────────────────────────┐
                    │                      BOOTSTRAP STAGE                      │
                    └─────────────────────────────┬─────────────────────────────┘
                                                  │
                      ┌───────────────────────────┴───────────────────────────┐
                      ▼                                                       ▼
        ┌───────────────────────────┐                           ┌───────────────────────────┐
        │ 1. Built-in Extensions    │                           │ 2. User / Agent Plugins   │
        │ (extensions/*)            │                           │ (~/.workboost/plugins/*)  │
        │  - Telegram Bot           │                           │  - custom-webhook.ts      │
        │  - Slack Bot              │                           │  - discord-bot.ts         │
        │  - Scheduler (Cron)       │                           │  - sync-notion.ts         │
        └─────────────┬─────────────┘                           └─────────────┬─────────────┘
                      │                                                       │
                      └───────────────────────────┬───────────────────────────┘
                                                  │
                                                  ▼
                    ┌───────────────────────────────────────────────────────────┐
                    │                EXTENSION MANAGER (CORE ENGINE)            │
                    │   - Tiêm ExtensionContext (DB, Agent, DataLayer, Logger)  │
                    │   - Đăng ký Webhook Routes vào Server                     │
                    │   - Đăng ký Cron Jobs vào Deno.cron                       │
                    └───────────────────────────────────────────────────────────┘
```

#### Flow 1: Khởi động tự động theo cấu hình (Zero Config / On-demand)
* **Khi khởi động server (`deno task start`):**
  * Nếu có biến môi trường `TELEGRAM_BOT_TOKEN` ➔ Tự động kích hoạt `TelegramExtension`.
  * Nếu có biến môi trường `SLACK_BOT_TOKEN` ➔ Tự động kích hoạt `SlackExtension`.
  * Luôn kích hoạt `SchedulerExtension` để chạy các tác vụ định kỳ.
* **Nếu thiếu token của kênh nào:** Extension của kênh đó sẽ không được nạp, không sinh route rác, không tốn bộ nhớ.

#### Flow 2: Người dùng hoặc AI Agent viết Custom Plugin (`~/.workboost/plugins/`)
* **Bước 1:** Người dùng tạo file `~/.workboost/plugins/discord-notify.ts` xuất ra một hàm `default(): WorkBoostExtension`.
* **Bước 2:** Khởi động lại hoặc reload server Work Boost.
* **Bước 3:** Hệ thống tự động quét thư mục `plugins/`, nạp file qua Deno dynamic import và kích hoạt extension.
* **Bước 4:** Route hoặc Cron job mới của plugin hoạt động ngay lập tức mà không cần build lại dự án.

#### Flow 3: Cách ly lỗi (Fault Isolation)
* Nếu một plugin bên ngoài bị lỗi cú pháp hoặc ném ngoại lệ trong hàm `init()`:
  * Hệ thống ghi log cảnh báo: `[ExtensionManager] Failed to load plugin "discord-notify": <Error>`.
  * Server vẫn khởi động bình thường, các extension khác không bị ảnh hưởng.

---

### 3. Ngoài phạm vi (Out of Scope)
* Chưa xây dựng Marketplace/Package Registry (tải plugin từ internet qua lệnh CLI như `workboost install ...`). Giai đoạn này tập trung vào nạp file nội bộ cục bộ.
* Chưa hỗ trợ WASM Sandbox riêng cho plugin (mọi plugin chạy trực tiếp trên quyền hạn runtime của tiến trình Deno).

---

## PHẦN 2: TECHNICAL SPECIFICATION (Đặc tả Kiến trúc & Kỹ thuật)

### 1. Kiến trúc Hợp đồng (Extension Contracts & Types)

Toàn bộ interface cốt lõi sẽ nằm tại package trung tâm `@work-boost/extension-core` (hoặc `extensions/types.ts`).

#### `extensions/types.ts`
```typescript
import type { AgentPort } from '@work-boost/brain';
import type { DataLayer, Database } from '@work-boost/data-provider';
import type { Logger } from '@work-boost/shared';

/**
 * Ngữ cảnh được truyền từ Core Server vào mỗi Extension
 */
export interface ExtensionContext {
  dataLayer: DataLayer;
  db: Database;
  agent: AgentPort;
  logger: Logger;
  env: {
    get(key: string): string | undefined;
  };
}

/**
 * Router trung gian để Extension đăng ký Webhook và API endpoints
 */
export interface ExtensionRouter {
  get(path: string, handler: (req: Request) => Promise<Response>): void;
  post(path: string, handler: (req: Request) => Promise<Response>): void;
  put(path: string, handler: (req: Request) => Promise<Response>): void;
  delete(path: string, handler: (req: Request) => Promise<Response>): void;
}

/**
 * Định nghĩa cấu trúc Cron Job do Extension cung cấp
 */
export interface ExtensionCronJob {
  name: string;
  schedule: string; // Cú pháp cron: "0 9 * * *"
  handler: () => Promise<void>;
}

/**
 * Hợp đồng chính mà mọi Extension / Plugin phải tuân thủ
 */
export interface WorkBoostExtension {
  readonly name: string;
  readonly version?: string;

  /** Vòng đời: Khởi tạo và nhận context */
  init(ctx: ExtensionContext): Promise<void> | void;

  /** Đăng ký các HTTP endpoints / Webhooks (nếu có) */
  registerRoutes?(router: ExtensionRouter): void;

  /** Đăng ký các tác vụ Cron định kỳ (nếu có) */
  registerJobs?(): ExtensionCronJob[];

  /** Dọn dẹp tài nguyên khi Server tắt (nếu có) */
  dispose?(): Promise<void> | void;
}
```

---

### 2. Bộ điều phối trung tâm: `ExtensionManager`

#### `extensions/manager.ts`
```typescript
import type { 
  WorkBoostExtension, 
  ExtensionContext, 
  ExtensionRouter, 
  ExtensionCronJob 
} from './types.ts';

export class ExtensionManager {
  private extensions = new Map<string, WorkBoostExtension>();
  private routes: Array<{ method: string; path: string; handler: (req: Request) => Promise<Response> }> = [];
  private jobs: ExtensionCronJob[] = [];

  constructor(private readonly ctx: ExtensionContext) {}

  /** Đăng ký một extension vào hệ thống */
  use(ext: WorkBoostExtension): this {
    if (this.extensions.has(ext.name)) {
      this.ctx.logger.warn(`Extension "${ext.name}" already registered. Overwriting.`);
    }
    this.extensions.set(ext.name, ext);
    return this;
  }

  /** Khởi tạo tất cả extensions và gom routes/jobs */
  async initAll(): Promise<void> {
    const router: ExtensionRouter = {
      get: (path, handler) => this.routes.push({ method: 'GET', path, handler }),
      post: (path, handler) => this.routes.push({ method: 'POST', path, handler }),
      put: (path, handler) => this.routes.push({ method: 'PUT', path, handler }),
      delete: (path, handler) => this.routes.push({ method: 'DELETE', path, handler }),
    };

    for (const [name, ext] of this.extensions) {
      try {
        await ext.init(this.ctx);
        if (ext.registerRoutes) ext.registerRoutes(router);
        if (ext.registerJobs) this.jobs.push(...ext.registerJobs());
        this.ctx.logger.info(`[ExtensionManager] Loaded extension: ${name}`);
      } catch (error) {
        this.ctx.logger.error(`[ExtensionManager] Failed to initialize extension: ${name}`, { error });
      }
    }
  }

  /** Khớp và chuyển tiếp HTTP request đến đúng route của extension */
  async handleRequest(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    const matched = this.routes.find((r) => r.method === method && r.path === pathname);
    if (!matched) return null;

    return await matched.handler(req);
  }

  /** Đăng ký toàn bộ Cron Jobs vào Deno.cron */
  registerAllCronJobs(): void {
    for (const job of this.jobs) {
      try {
        Deno.cron(job.name, job.schedule, async () => {
          this.ctx.logger.info(`[Cron] Executing job: ${job.name}`);
          await job.handler();
        });
        this.ctx.logger.info(`[Cron] Registered job: ${job.name} (${job.schedule})`);
      } catch (err) {
        this.ctx.logger.error(`[Cron] Failed to register job: ${job.name}`, { error: err });
      }
    }
  }

  /** Dọn dẹp tất cả extension khi shutdown */
  async disposeAll(): Promise<void> {
    for (const ext of this.extensions.values()) {
      try {
        if (ext.dispose) await ext.dispose();
      } catch {}
    }
    this.extensions.clear();
  }
}
```

---

### 3. Bộ nạp tự động (Dynamic Plugin Auto-Loader)

#### `extensions/loader.ts`
```typescript
import { join } from '@std/path';
import type { ExtensionManager } from './manager.ts';
import type { ExtensionContext } from './types.ts';

export async function loadUserPlugins(manager: ExtensionManager, ctx: ExtensionContext): Promise<void> {
  const homeDir = Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '.';
  const pluginDir = join(homeDir, '.workboost', 'plugins');

  try {
    const entries = Deno.readDir(pluginDir);
    for await (const entry of entries) {
      if (entry.isFile && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        try {
          const fullPath = `file://${join(pluginDir, entry.name)}`;
          const pluginModule = await import(fullPath);

          if (typeof pluginModule.default === 'function') {
            const pluginInstance = pluginModule.default();
            manager.use(pluginInstance);
            ctx.logger.info(`[PluginLoader] Discovered user plugin: ${entry.name}`);
          }
        } catch (err) {
          ctx.logger.error(`[PluginLoader] Error loading user plugin "${entry.name}"`, { error: err });
        }
      }
    }
  } catch {
    // Thư mục plugins chưa tồn tại -> bỏ qua an toàn
  }
}
```

---

### 4. Tái cấu trúc thư mục dự án (Directory Restructuring)

* **Xóa bỏ / Thay thế:** `packages/services/`
* **Cấu trúc mới tại gốc `extensions/`:**

```text
├── extensions/
│   ├── types.ts                     <-- Interfaces: WorkBoostExtension, ExtensionContext
│   ├── manager.ts                   <-- ExtensionManager Engine
│   ├── loader.ts                    <-- Dynamic Plugin Auto-Loader
│   │
│   ├── telegram/                    <-- Built-in Telegram Extension
│   │   ├── formatters.ts            <-- HTML formatting + InlineKeyboards
│   │   ├── handlers.ts              <-- Gom toàn bộ action nợ & daily vào 1 file
│   │   ├── telegram-service.ts      <-- GrammY wrapper
│   │   ├── mod.ts                   <-- export function telegramExtension()
│   │   └── deno.json
│   │
│   ├── slack/                       <-- Built-in Slack Extension
│   │   ├── formatters.ts            <-- Mrkdwn + Block Kit formatting
│   │   ├── handlers.ts              <-- Xử lý slash command & tin nhắn
│   │   ├── slack-service.ts         <-- Webhook validator & message sender
│   │   ├── mod.ts                   <-- export function slackExtension()
│   │   └── deno.json
│   │
│   └── scheduler/                   <-- Built-in Scheduler Extension
│       ├── jobs.ts                  <-- Logic chạy Standup 9h sáng & Nhắc nợ
│       ├── mod.ts                   <-- export function schedulerExtension()
│       └── deno.json
│
├── apps/api/src/
│   ├── server.ts                    <-- Nhận extensionManager.handleRequest(req)
│   └── bootstrap.ts                 <-- Nạp Built-in + User Plugins
└── deno.json                        <-- Cập nhật imports workspace
```

---

### 5. Cập nhật `apps/api/src/server.ts` & `bootstrap.ts`

#### `apps/api/src/bootstrap.ts`
```typescript
import { createBrain } from '@work-boost/brain';
import { createDataLayer, Database } from '@work-boost/data-provider';
import { env } from '@work-boost/shared';
import { logger } from '@work-boost/shared/logger/logger.ts';
import { ExtensionManager } from '../../../extensions/manager.ts';
import { loadUserPlugins } from '../../../extensions/loader.ts';
import { telegramExtension } from '../../../extensions/telegram/mod.ts';
import { slackExtension } from '../../../extensions/slack/mod.ts';
import { schedulerExtension } from '../../../extensions/scheduler/mod.ts';

export async function bootstrapApp() {
  const dataLayer = createDataLayer();
  await dataLayer.fs.init();
  await dataLayer.config.load();

  const db = await Database.init(dataLayer);
  const agent = createBrain({ apiKey: env.get('GOOGLE_API_KEY') || '', dataLayer });

  const extContext = { dataLayer, db, agent, logger, env };
  const extensionManager = new ExtensionManager(extContext);

  // 1. Nạp Built-in Extensions nếu có cấu hình
  if (env.get('TELEGRAM_BOT_TOKEN')) {
    extensionManager.use(telegramExtension());
  }
  if (env.get('SLACK_BOT_TOKEN')) {
    extensionManager.use(slackExtension());
  }
  extensionManager.use(schedulerExtension());

  // 2. Tự động nạp Custom Plugins từ ~/.workboost/plugins/
  await loadUserPlugins(extensionManager, extContext);

  // 3. Khởi tạo toàn bộ
  await extensionManager.initAll();
  extensionManager.registerAllCronJobs();

  return { dataLayer, db, agent, extensionManager };
}
```

#### `apps/api/src/server.ts` (Dispatcher tối giản)
```typescript
// Trong hàm handleRequest của server.ts:

// 1. Kiểm tra xem request có khớp với route của Extension nào không
const extensionResponse = await config.extensionManager.handleRequest(req);
if (extensionResponse) {
  logResponse(req, extensionResponse, ctx);
  return extensionResponse;
}

// 2. Nếu không khớp thì chuyển tiếp sang REST API / Static Apps / 404...
```

---

## PHẦN 3: KẾ HOẠCH KIỂM THỬ (TEST PLAN)

### 1. Unit Tests
* **`tests/extensions/manager.test.ts`**:
  * Kiểm thử `ExtensionManager` khởi tạo đúng vòng đời `initAll()`.
  * Kiểm thử route registration: `handleRequest()` định tuyến đúng URL đến handler của extension.
  * Kiểm thử cách ly lỗi: 1 extension lỗi không làm sập các extension còn lại.
* **`tests/extensions/loader.test.ts`**:
  * Tạo 1 plugin mẫu trong thư mục tạm `tempDir`, gọi `loadUserPlugins()` và xác nhận plugin được kích hoạt thành công.
* **`tests/extensions/telegram.test.ts` & `slack.test.ts`**:
  * Đảm bảo toàn bộ test case cũ của Telegram và Slack tiếp tục pass 100%.

### 2. Tiêu chuẩn nghiệm thu (Acceptance Criteria)
* [ ] **AC-1:** Xóa bỏ hoàn toàn `packages/services/`, cấu trúc thư mục chuyển thành `extensions/` sạch sẽ.
* [ ] **AC-2:** Chạy `apps/api`, webhook `/telegram` và `/subscribe` (Slack) hoạt động chuẩn xác thông qua cơ chế Extension.
* [ ] **AC-3:** Tạo file `~/.workboost/plugins/test-plugin.ts` ➔ Khởi động server ➔ Route mới của test plugin phản hồi `HTTP 200 OK`.
* [ ] **AC-4:** Chạy `deno test --allow-all` và `deno task check:ci` đạt 100% xanh.
