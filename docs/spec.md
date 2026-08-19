# 📑 MASTER SOFTWARE DESIGN DOCUMENT (SDD) - V2
## Giai đoạn 3: HTML Apps & Runtime Broker (Hubble-Native Architecture)

---

## BLOCK 0: REQUIREMENTS TRACEABILITY CHECKLIST

| ID | Nhóm | Yêu cầu kỹ thuật & Tính năng | Trạng thái thiết kế |
| :--- | :--- | :--- | :---: |
| **FR-01** | Runtime | **Auto-Injected Runtime:** Server tự động bơm CSS Theme, Tailwind, Alpine.js và Broker `window.workboost` vào file HTML khi phục vụ; người dùng không cần cấu hình `<script>` hay bundler. | ✅ Chuẩn Hubble |
| **FR-02** | Broker API | Cung cấp **HTML App File API** nguyên tử (`readFile`, `writeFile`, `patchFile`, `listFiles`) kèm biến thể **Safe Variant** (`safeReadFile`, `safePatchFile`,...). | ✅ Chuẩn Hubble |
| **FR-03** | Domain SDK | Cung cấp Domain Helpers cấp cao (`workboost.debts.*`, `workboost.daily.*`, `workboost.time.*`). | ✅ Hoàn thành |
| **FR-04** | Real-time | **SSE Watcher:** Kênh Server-Sent Events (`/api/workspace/events`) phát tín hiệu khi đĩa thay đổi để HTML Apps tự cập nhật giao diện ngay lập tức. | ✅ Hoàn thành |
| **FR-05** | HTML Apps | `debt-tracker.html` & `standup-viewer.html` là các file HTML độc lập nằm ngay trong thư mục gốc Workspace của người dùng. | ✅ Hoàn thành |
| **FR-06** | Multi-Currency | `debt-tracker.html` xử lý hiển thị tách bạch từng đồng tiền (VND, USD,...), không cộng gộp sai lệch. | ✅ Hoàn thành |
| **FR-07** | Timezone | Đồng bộ thời gian thực tế với cấu hình `config.timezone` của Workspace, loại bỏ lỗi lệch múi giờ UTC. | ✅ Hoàn thành |
| **NFR-01**| Sandboxing | File HTML được phục vụ với header `Content-Security-Policy: sandbox allow-scripts allow-forms`. | ✅ Chuẩn Hubble |
| **NFR-02**| Security | Chặn Path Traversal và Blacklist các file nhạy cảm (`.env`, `.workboost/config.json`, `.git/`). | ✅ Hoàn thành |
| **NFR-03**| Access Guard | Localhost Loopback Guard: Chỉ cho phép kết nối nội bộ từ máy local gọi các API Workspace. | ✅ Hoàn thành |
| **NFR-04**| Fault Tolerance| Safe Parsing: File Markdown bị lỗi YAML Frontmatter sẽ bị bỏ qua và ghi log cảnh báo, không làm sập API (500). | ✅ Hoàn thành |

---

## BLOCK 1: ARCHITECTURE OVERVIEW & SYSTEM TOPOLOGY

Work Boost áp dụng mô hình **Runtime Auto-Injection & Broker Pattern** của Hubble.md. HTML App là file thuần túy nằm trong Workspace; Server đóng vai trò Gateway phục vụ và bơm môi trường thực thi an toàn.

```
                  ┌────────────────────────────────────────────────────────┐
                  │          PHYSICAL WORKSPACE (~/.workboost/workspace)   │
                  │   ├── debt-tracker.html (Pure HTML template)           │
                  │   ├── standup-viewer.html (Pure HTML template)         │
                  │   ├── daily/YYYY-MM-DD.md                              │
                  │   └── debts/*.md & debts/archive/*.md                  │
                  └───────────────────────────┬────────────────────────────┘
                                              │ 
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             APPS/API (Deno HTTP Server)                                  │
│                                                                                          │
│  [GET /workspace-apps/:file]                                                             │
│       │                                                                                  │
│       ├── 1. Đọc file raw .html từ Workspace                                             │
│       ├── 2. injectHtmlAppRuntime():                                                     │
│       │        - Chèn CSS Theme + Tailwind Browser + window.workboost vào <head>         │
│       │        - Chèn Alpine.js CDN vào cuối <body>                                      │
│       └── 3. Trả về HTML kèm header: Content-Security-Policy: sandbox allow-scripts ...  │
│                                                                                          │
│  [REST API: /api/workspace/*] ─── (Localhost Guard + No-Store Cache) ───┐                │
│  [SSE Stream: /api/workspace/events] ◄── (createWorkspaceWatcher) ──────┤                │
└─────────────────────────────────────────────┬───────────────────────────┴────────────────┘
                                              │ Direct Call
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          PACKAGES/DATA-PROVIDER (DataLayer)                              │
│         - WorkspaceFS (assertInside, Mutex Locks, Atomic Temp Rename)                    │
│         - Repositories (Safe Frontmatter Parsing, Archive Move on Settle)                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## BLOCK 2: DATA MODEL REQUIREMENTS & ENVELOPES

### 2.1 Chuẩn phản hồi Envelope (`ApiResponse<T>`)
```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    requestId?: string;
  };
}
```

### 2.2 Safe Result Pattern cho Broker Client
Tất cả các phương thức của Broker đều có biến thể `safe*` tuân thủ nguyên tắc không throw Exception:
```typescript
export type SafeResult<T> = 
  | { ok: true; data: T; error?: never }
  | { ok: false; error: { code: string; message: string }; data?: never };
```

### 2.3 Cấu trúc File Markdown có cấu trúc (Frontmatter + Body)
```typescript
export interface ParsedMarkdownFile<T = Record<string, unknown>> {
  path: string;
  frontmatter: T;
  body: string;
  size: number;
  modifiedAt: string;
}
```

---

## BLOCK 3: BROKER SDK & API SPECIFICATIONS

### 3.1 Giao diện `window.workboost` (TypeScript Interface)

```typescript
export interface WorkBoostBroker {
  // 1. Generic HTML App File API (Chuẩn Hubble)
  fs: {
    readFile<T = Record<string, unknown>>(path: string): Promise<ParsedMarkdownFile<T>>;
    safeReadFile<T = Record<string, unknown>>(path: string): Promise<SafeResult<ParsedMarkdownFile<T>>>;
    
    writeFile(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<void>;
    safeWriteFile(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<SafeResult<void>>;
    
    patchFile(path: string, patch: { frontmatter?: Record<string, unknown>; body?: string }): Promise<void>;
    safePatchFile(path: string, patch: { frontmatter?: Record<string, unknown>; body?: string }): Promise<SafeResult<void>>;
    
    listFiles(globPattern?: string): Promise<string[]>;
    safeListFiles(globPattern?: string): Promise<SafeResult<string[]>>;
  };

  // 2. High-level Domain Helpers
  debts: {
    list(filter?: { status?: string; direction?: string; personName?: string }): Promise<DebtDocument[]>;
    getSummary(): Promise<DebtSummary>;
    settle(debtId: string): Promise<DebtDocument>;
    create(data: { personName: string; amount: number; direction: 'lent' | 'borrowed'; currency?: string; reason?: string; debtDate?: string }): Promise<DebtDocument>;
    cancel(debtId: string): Promise<DebtDocument>;
    delete(debtId: string): Promise<boolean>;
  };

  daily: {
    getToday(): Promise<DailyWorkDocument | null>;
    get(date: string): Promise<DailyWorkDocument | null>;
    save(date: string, report: DailyWorkReport, customSections?: string): Promise<DailyWorkDocument>;
  };

  // 3. Workspace Context & Real-time
  time: {
    getCurrentDate(): Promise<string>;
    getTimezone(): Promise<string>;
  };

  events: {
    subscribe(callback: (event: { paths: string[]; kind: string }) => void): () => void;
  };
}

declare global {
  interface Window {
    workboost: WorkBoostBroker;
  }
}
```

### 3.2 Đặc tả REST Endpoints (`apps/api/src/routes/workspace.ts`)

Tất cả các endpoint đều trả về header `Cache-Control: no-store, no-cache, must-revalidate`.

| Endpoint | Method | Mô tả |
| :--- | :---: | :--- |
| `GET /workspace-apps/:filename` | `GET` | Phục vụ file HTML từ Workspace và tự động chạy `injectHtmlAppRuntime()`. |
| `GET /api/workspace/events` | `GET` | Mở kết nối Server-Sent Events (SSE) để phát thông báo khi file trên đĩa thay đổi. |
| `GET /api/workspace/time` | `GET` | Trả về `{ currentDate: 'YYYY-MM-DD', timezone: '...' }` theo `config.timezone`. |
| `GET /api/workspace/fs/read?path=...` | `GET` | Đọc file markdown, tách sẵn `frontmatter` và `body`. |
| `POST /api/workspace/fs/patch` | `POST` | Patch một phần frontmatter hoặc body mà không làm mất các trường khác. |
| `GET /api/workspace/fs/list?glob=...` | `GET` | Liệt kê các file markdown/json trong workspace. |
| `GET /api/workspace/debts?status=...` | `GET` | Lấy danh sách nợ với query params lọc linh hoạt (`status`, `direction`, `personName`). |
| `GET /api/workspace/debts/summary` | `GET` | Lấy bảng tổng kết tài chính (có đầy đủ `currencies` map). |
| `POST /api/workspace/debts/create` | `POST` | Tạo bản ghi nợ mới (gán `updatedBy: 'user'`). |
| `POST /api/workspace/debts/:id/settle` | `POST` | Đánh dấu đã trả và dời file vào `debts/archive/`. |
| `POST /api/workspace/debts/:id/cancel` | `POST` | Hủy nợ và dời file vào `debts/archive/`. |
| `DELETE /api/workspace/debts/:id` | `DELETE` | Xóa vĩnh viễn file nợ khỏi đĩa. |
| `GET /api/workspace/daily/today` | `GET` | Lấy báo cáo công việc của ngày hôm nay (tính theo timezone workspace). |
| `GET /api/workspace/daily/:date` | `GET` | Lấy báo cáo công việc ngày cụ thể. |
| `POST /api/workspace/daily/:date` | `POST` | Lưu báo cáo công việc (nhận `{ report, customSections }`, gán `updatedBy: 'user'`). |

---

## BLOCK 4: SECURITY & ISOLATION SPECIFICATION

```
[Incoming Request] ───► [1. Localhost Guard: Block non-loopback IP]
                                   │
                                   ▼
                        [2. Workspace Router]
                                   │
                                   ▼
                        [3. Path Filter & Whitelist]
                        - Cấm: path chứa "..", ".env", ".workboost/config.json", ".git"
                        - Cho phép: *.md, *.json, *.txt, *.html
                                   │
                                   ▼
                        [4. WorkspaceFS.assertInside()]
                        - Deno.realPath canonicalization
                                   │
                                   ▼
                        [5. Atomic Write & Mutex Lock]
```

1. **Localhost Access Guard:** Middleware chặn toàn bộ request gọi vào `/api/workspace/*` nếu không xuất phát từ `127.0.0.1`, `::1` hoặc `localhost`.
2. **Rate Limit Exemption:** Miễn trừ rate limiting cho router `/api/workspace/*` để Dashboard không bị dính HTTP 429.
3. **CSP Sandbox:** Mọi file HTML App khi serve đều có header:
   ```http
   Content-Security-Policy: sandbox allow-scripts allow-forms allow-same-origin;
   ```
4. **Fault-Tolerant Frontmatter Reader:** 
   Trong `DebtRepository.listAll()`, nếu gặp file bị lỗi định dạng YAML do chỉnh sửa tay:
   * Không ném Exception làm sập API (500).
   * Ghi log cảnh báo `logger.warn('Corrupted debt file detected', { path })`.
   * Bỏ qua file lỗi để toàn bộ danh sách còn lại vẫn hiển thị bình thường.

---

## BLOCK 5: COMPONENT DESIGN & CODE IMPLEMENTATION

### 5.1 Hàm Auto-Injection (`apps/api/src/utils/html-injector.ts`)
Tái hiện chính xác cơ chế của Hubble.md:

```typescript
const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"></script>';
const ALPINE_CDN = '<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>';

function styleTag(css: string): string {
  return `<style data-workboost-injected="theme">\n${css}\n</style>`;
}

function scriptTag(js: string): string {
  return `<script data-workboost-injected="runtime">\n${js}\n</script>`;
}

export function injectHtmlAppRuntime(rawHtml: string, runtimeBundleJs: string): string {
  const headInjection = `\n${TAILWIND_CDN}\n${scriptTag(runtimeBundleJs)}\n`;
  const bodyEndInjection = `\n${ALPINE_CDN}\n`;

  let html = rawHtml;
  if (html.search(/<\/head\s*>/i) === -1) {
    html = `${headInjection}${html}`;
  } else {
    html = html.replace(/<\/head\s*>/i, `${headInjection}</head>`);
  }

  if (html.search(/<\/body\s*>/i) === -1) {
    html = `${html}${bodyEndInjection}`;
  } else {
    html = html.replace(/<\/body\s*>/i, `${bodyEndInjection}</body>`);
  }

  return html;
}
```

### 5.2 Mã nguồn Broker Runtime Client (`packages/runtime/src/global.js`)

File script JS này sẽ được inject tự động vào mọi HTML App:

```javascript
(function () {
  const API_BASE = '/api/workspace';

  async function request(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      const err = new Error(json.error?.message || 'Request failed');
      err.code = json.error?.code || 'INTERNAL_ERROR';
      err.details = json.error?.details;
      throw err;
    }
    return json.data;
  }

  async function safe(promise) {
    try {
      const data = await promise;
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: error.code || 'UNKNOWN', message: error.message } };
    }
  }

  const broker = {
    fs: {
      readFile: (path) => request(`/fs/read?path=${encodeURIComponent(path)}`),
      safeReadFile: (path) => safe(broker.fs.readFile(path)),
      patchFile: (path, patch) => request('/fs/patch', { method: 'POST', body: JSON.stringify({ path, patch }) }),
      safePatchFile: (path, patch) => safe(broker.fs.patchFile(path, patch)),
      listFiles: (glob = '**/*') => request(`/fs/list?glob=${encodeURIComponent(glob)}`),
      safeListFiles: (glob) => safe(broker.fs.listFiles(glob)),
    },

    debts: {
      list: (filter = {}) => {
        const params = new URLSearchParams();
        if (filter.status) params.set('status', filter.status);
        if (filter.direction) params.set('direction', filter.direction);
        if (filter.personName) params.set('personName', filter.personName);
        return request(`/debts?${params.toString()}`);
      },
      getSummary: () => request('/debts/summary'),
      settle: (id) => request(`/debts/${id}/settle`, { method: 'POST' }),
      cancel: (id) => request(`/debts/${id}/cancel`, { method: 'POST' }),
      delete: (id) => request(`/debts/${id}`, { method: 'DELETE' }),
      create: (data) => request('/debts/create', { method: 'POST', body: JSON.stringify(data) }),
    },

    daily: {
      getToday: () => request('/daily/today'),
      get: (date) => request(`/daily/${date}`),
      save: (date, report, customSections = '') => 
        request(`/daily/${date}`, { method: 'POST', body: JSON.stringify({ report, customSections }) }),
    },

    time: {
      getCurrentDate: async () => (await request('/time')).currentDate,
      getTimezone: async () => (await request('/time')).timezone,
    },

    events: {
      subscribe: (callback) => {
        const sse = new EventSource(`${API_BASE}/events`);
        sse.onmessage = (e) => {
          try { callback(JSON.parse(e.data)); } catch {}
        };
        return () => sse.close();
      }
    }
  };

  window.workboost = broker;

  // Lắng nghe sự kiện SSE và phát ra DOM Event để Alpine.js tự reload
  broker.events.subscribe((event) => {
    window.dispatchEvent(new CustomEvent('workboost:change', { detail: event }));
  });
})();
```

### 5.3 Mẫu HTML App 1: `debt-tracker.html` (Đa tiền tệ + Real-time Reactive)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Sổ Nợ Cá Nhân</title>
</head>
<body class="bg-stone-50 text-stone-900 p-6 font-sans antialiased">
  <div class="max-w-4xl mx-auto space-y-6" x-data="debtTracker()" x-init="init()">
    
    <header class="flex items-center justify-between border-b border-stone-200 pb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">💰 Sổ Nợ Work Boost</h1>
        <p class="text-sm text-stone-500">Tự động đồng bộ với Telegram & File Markdown</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
          <span class="w-1.5 h-1.5 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Live Sync
        </span>
        <button @click="loadData()" class="px-3 py-1.5 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg text-sm font-medium shadow-sm">
          🔄 Làm mới
        </button>
      </div>
    </header>

    <!-- Multi-Currency Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <template x-for="(totals, curr) in summary.currencies" :key="curr">
        <div class="p-4 bg-white rounded-xl shadow-sm border border-stone-200 space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold uppercase tracking-wider text-stone-400" x-text="curr"></span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded"
                  :class="(totals.lent - totals.borrowed) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'"
                  x-text="(totals.lent - totals.borrowed) >= 0 ? 'Dương' : 'Âm'"></span>
          </div>
          <div class="text-2xl font-black text-stone-900" x-text="formatMoney(totals.lent - totals.borrowed, curr)"></div>
          <div class="text-xs text-stone-500 flex justify-between border-t pt-2">
            <span>Được nợ: <b class="text-emerald-600" x-text="formatMoney(totals.lent, curr)"></b></span>
            <span>Cần trả: <b class="text-rose-600" x-text="formatMoney(totals.borrowed, curr)"></b></span>
          </div>
        </div>
      </template>
    </div>

    <!-- Filter Buttons -->
    <div class="flex gap-2">
      <template x-for="f in ['all', 'pending', 'paid', 'lent', 'borrowed']" :key="f">
        <button @click="filter = f; loadDebts()" 
                class="px-3 py-1 text-xs rounded-full uppercase tracking-wider font-bold transition"
                :class="filter === f ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'"
                x-text="f"></button>
      </template>
    </div>

    <!-- List -->
    <div class="bg-white rounded-xl shadow-sm border border-stone-200 divide-y divide-stone-100 overflow-hidden">
      <template x-if="debts.length === 0">
        <div class="p-8 text-center text-stone-400">📭 Không có khoản nợ nào.</div>
      </template>
      <template x-for="debt in debts" :key="debt.frontmatter.id">
        <div class="p-4 flex items-center justify-between hover:bg-stone-50 transition">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 text-xs font-bold rounded"
                    :class="debt.frontmatter.direction === 'lent' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
                    x-text="debt.frontmatter.direction === 'lent' ? 'CHO VAY' : 'VAY'"></span>
              <span class="font-bold text-stone-900" x-text="debt.frontmatter.personName"></span>
              <span class="text-xs text-stone-400" x-text="debt.frontmatter.debtDate"></span>
            </div>
            <div class="text-sm text-stone-600" x-text="debt.reason || '(Không có lý do)'"></div>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <div class="font-black text-lg text-stone-900" x-text="formatMoney(debt.frontmatter.amount, debt.frontmatter.currency)"></div>
              <span class="text-xs font-semibold"
                    :class="debt.frontmatter.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'"
                    x-text="debt.frontmatter.status === 'paid' ? '✅ Đã trả' : '⏳ Chờ trả'"></span>
            </div>
            <template x-if="debt.frontmatter.status === 'pending'">
              <button @click="settle(debt.frontmatter.id)" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
                Đã trả
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>

  <script>
    function debtTracker() {
      return {
        filter: 'all',
        debts: [],
        summary: { currencies: {} },
        async init() {
          await this.loadData();
          // Tự động reload khi Telegram bot hoặc Agent chỉnh sửa file trên đĩa
          window.addEventListener('workboost:change', () => this.loadData());
        },
        async loadData() {
          await Promise.all([this.loadSummary(), this.loadDebts()]);
        },
        async loadSummary() {
          this.summary = await window.workboost.debts.getSummary();
        },
        async loadDebts() {
          let query = {};
          if (this.filter === 'pending' || this.filter === 'paid') query.status = this.filter;
          if (this.filter === 'lent' || this.filter === 'borrowed') query.direction = this.filter;
          this.debts = await window.workboost.debts.list(query);
        },
        async settle(id) {
          await window.workboost.debts.settle(id);
          await this.loadData();
        },
        formatMoney(amount, currency = 'VND') {
          return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount || 0);
        }
      }
    }
  </script>
</body>
</html>
```

### 5.4 Mẫu HTML App 2: `standup-viewer.html` (Bảng tổng kết công việc)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Daily Standup</title>
</head>
<body class="bg-stone-50 text-stone-900 p-6 font-sans antialiased">
  <div class="max-w-3xl mx-auto space-y-6" x-data="standupViewer()" x-init="init()">
    <header class="flex items-center justify-between border-b border-stone-200 pb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">📝 Báo Cáo Standup Hằng Ngày</h1>
        <p class="text-sm text-stone-500" x-text="'Ngày ' + currentDate"></p>
      </div>
      <button @click="copyMarkdown()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition">
        📋 Copy Markdown
      </button>
    </header>

    <div class="space-y-4">
      <div class="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-3">
        <h2 class="font-bold text-emerald-700">✅ 1. Việc đã hoàn thành hôm trước</h2>
        <ul class="space-y-1.5">
          <template x-for="item in doc?.report?.completed || []">
            <li class="flex gap-2 text-sm">
              <span class="font-bold px-2 py-0.5 bg-stone-100 text-stone-800 rounded text-xs" x-text="item.project"></span>
              <span class="text-stone-700" x-text="item.task"></span>
            </li>
          </template>
        </ul>
      </div>

      <div class="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-3">
        <h2 class="font-bold text-rose-700">⏳ 2. Chưa hoàn thành</h2>
        <ul class="space-y-1.5">
          <template x-for="item in doc?.report?.incomplete || []">
            <li class="flex gap-2 text-sm">
              <span class="font-bold px-2 py-0.5 bg-stone-100 text-stone-800 rounded text-xs" x-text="item.project"></span>
              <span class="text-stone-700" x-text="item.task"></span>
            </li>
          </template>
        </ul>
      </div>

      <div class="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-3">
        <h2 class="font-bold text-sky-700">🚀 3. Kế hoạch hôm nay</h2>
        <ul class="space-y-1.5">
          <template x-for="item in doc?.report?.planned || []">
            <li class="flex gap-2 text-sm">
              <span class="font-bold px-2 py-0.5 bg-stone-100 text-stone-800 rounded text-xs" x-text="item.project"></span>
              <span class="text-stone-700" x-text="item.task"></span>
            </li>
          </template>
        </ul>
      </div>
    </div>
  </div>

  <script>
    function standupViewer() {
      return {
        currentDate: '',
        doc: null,
        async init() {
          this.currentDate = await window.workboost.time.getCurrentDate();
          this.doc = await window.workboost.daily.getToday();
          window.addEventListener('workboost:change', async () => {
            this.doc = await window.workboost.daily.getToday();
          });
        },
        copyMarkdown() {
          if (!this.doc?.rawMarkdown) return;
          navigator.clipboard.writeText(this.doc.rawMarkdown);
          alert('Đã copy nội dung Standup Markdown!');
        }
      }
    }
  </script>
</body>
</html>
```

---

## BLOCK 6: TESTING & VERIFICATION PLAN

### 6.1 Danh mục Unit & Integration Tests cần triển khai

1. **`tests/runtime/html-injector.test.ts`**:
   * Kiểm thử `injectHtmlAppRuntime()` chèn đúng CSS theme, Tailwind, runtime JS và Alpine.js vào thẻ `<head>` và `<body>`.
   * Kiểm thử trường hợp file HTML thiếu thẻ `<head>` hoặc `<body>` vẫn chèn thành công.
2. **`tests/routes/workspace-router.test.ts`**:
   * Kiểm thử `GET /workspace-apps/debt-tracker.html` trả về HTTP 200, Content-Type `text/html` và CSP Sandbox Header.
   * Kiểm thử bảo mật Path Traversal `GET /api/workspace/fs/read?path=../../.env` trả về `403/500 Access Denied`.
   * Kiểm thử `GET /api/workspace/debts/summary` tính đúng `currencies` khi có đồng thời USD và VND.
   * Kiểm thử `safeParse` trong repository: Khi cố tình tạo 1 file `.md` chứa YAML hỏng, API list vẫn chạy bình thường.
3. **`tests/routes/sse-events.test.ts`**:
   * Kiểm thử tạo kết nối SSE `GET /api/workspace/events` nhận đúng payload event khi có file bị ghi đè.

### 6.2 Tiêu chuẩn nghiệm thu E2E (Acceptance Criteria)

* [ ] **AC-1:** Khởi động server Deno, mở trình duyệt tại `http://localhost:3001/workspace-apps/debt-tracker.html`: Giao diện hiển thị tức thì với đầy đủ Tailwind CSS & Alpine.js mà không có lỗi console.
* [ ] **AC-2:** Trên điện thoại, nhắn tin qua Telegram bot: *"Vừa vay Alex 200k ăn tối"* ➔ Quan sát màn hình máy tính: Không cần bấm F5, giao diện `debt-tracker.html` tự động cập nhật khoản nợ mới thông qua kênh SSE Watcher.
* [ ] **AC-3:** Bấm nút **[Đã trả]** trên giao diện: File `.md` chuyển vào `debts/archive/` và Net Position cập nhật ngay lập tức.
* [ ] **AC-4:** Chạy toàn bộ test suite `deno test --allow-all`: 100% tests vượt qua thành công.
