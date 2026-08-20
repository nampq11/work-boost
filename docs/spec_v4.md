# 📑 MASTER SOFTWARE DESIGN DESCRIPTION (SDD)
## WORK BOOST — PHASE 4: WORKSPACE SHELL
* **Tài liệu:** Thiết kế Kiến trúc & Chi tiết Client UI
* **Phiên bản:** 2.0.0 (Finalized Architecture)
* **Trạng thái:** Approved for Implementation

---

## 🎯 BLOCK 1: REQUIREMENTS CHECKLIST (BẢNG KIỂM YÊU CẦU)

Bảng theo dõi và nghiệm thu toàn bộ tính năng chức năng (FR) và phi chức năng (NFR) trong Giai đoạn 4:

| Mã | Hạng mục yêu cầu | Tiêu chí nghiệm thu (Acceptance Criteria) | Trạng thái |
| :--- | :--- | :--- | :---: |
| **FR-01** | **Cây thư mục (Sidebar Tree)** | Hiển thị phân cấp `daily/`, `debts/`, `debts/archive/`, các thư mục tự do và các file `.html` (Apps). Hỗ trợ icon phân loại và badge trạng thái. | ⬜ Chưa bắt đầu |
| **FR-02** | **Live-Sync thời gian thực** | Nhận SSE từ `/api/workspace/events`. Tự động cập nhật Sidebar và nạp lại Editor khi Telegram/Slack Bot ghi đè file. | ⬜ Chưa bắt đầu |
| **FR-03** | **Markdown WYSIWYG Editor** | Dùng Tiptap/ProseMirror hỗ trợ Heading, Bold/Italic, Task List `[ ]/[x]`, Code block. Phím tắt `⌘+Option+U` / `Ctrl+Alt+U` chuyển sang Raw Source Mode. | ⬜ Chưa bắt đầu |
| **FR-04** | **Frontmatter Inspector** | Header Bar trực quan hóa YAML: hiển thị/sửa trạng thái nợ (pending/paid), số tiền, ngày tháng; tự động bảo toàn các trường YAML lạ khi lưu. | ⬜ Chưa bắt đầu |
| **FR-05** | **HTML App Sandbox Viewer** | Chạy `debt-tracker.html` và `standup-viewer.html` trong `<iframe>` sandbox biệt lập (`allow-scripts allow-forms`), giao tiếp an toàn qua Broker `window.workboost`. | ⬜ Chưa bắt đầu |
| **FR-06** | **Autosave & Conflict Handling** | Tự động lưu sau 300ms (Debounced). Bật Toast cảnh báo khi có xung đột file đang gõ dở; Force Flush lưu đồng bộ khi chuyển file. | ⬜ Chưa bắt đầu |
| **FR-07** | **AI Copilot Drawer** | Khung chat trượt từ cạnh phải kết nối với Brain Agent (`/api/message`) để hỗ trợ tra cứu, tổng hợp công việc hoặc ghi nợ trực tiếp trên Web. | ⬜ Chưa bắt đầu |
| **FR-08** | **Command Palette (`⌘K`)** | Modal tìm kiếm nhanh file, tạo nhanh Daily Note hôm nay, tạo khoản nợ mới, kích hoạt HTML Apps. | ⬜ Chưa bắt đầu |
| **FR-09** | **An toàn dữ liệu & Undo** | Xóa file đưa vào `.workboost/trash/`, hiển thị Toast cho phép `Undo` (`Cmd+Z`) phục hồi tức thì. Cache bản thảo chưa lưu vào `localStorage`. | ⬜ Chưa bắt đầu |
| **NFR-01** | **Khởi động & Render tức thì** | Client nạp xong dưới **300ms**. Không bị giật lag khi gõ phím hoặc khi nhận event SSE dưới nền. | ⬜ Chưa bắt đầu |
| **NFR-02** | **Bảo mật Sandbox tuyệt đối** | Iframe HTML Apps bị chặn truy cập `window.parent`, chặn truy cập cookie/storage của Host, link web ngoài tự mở tab mới. | ⬜ Chưa bắt đầu |

---

## 🏛️ BLOCK 2: ARCHITECTURE OVERVIEW & COMPONENT DECOMPOSITION (TỔNG QUAN KIẾN TRÚC)

### 2.1. Sơ đồ Ngữ cảnh & Luồng Tương tác (System Context Diagram)

```
+---------------------------------------------------------------------------------------+
|                                  CLIENT SHELL (React 19)                              |
|                                                                                       |
|  +---------------------+  +--------------------------------------------------------+  |
|  |     SIDEBAR TREE    |  |                    MAIN VIEWPORT                       |  |
|  | - daily/            |  |                                                        |  |
|  | - debts/            |  |  [Case 1: *.md]               [Case 2: *.html]         |  |
|  |   - archive/        |  |  +-------------------------+  +---------------------+  |  |
|  | - HTML Apps         |  |  | FrontmatterInspector    |  | HtmlAppViewer       |  |  |
|  | - Custom Folders    |  |  +-------------------------+  | (Sandboxed Iframe)  |  |  |
|  | - New File/Folder   |  |  | Tiptap WYSIWYG / Source |  | src="/workspace-   |  |  |
|  +---------------------+  |  +-------------------------+  |   apps/*.html"      |  |  |
|             |             +--------------------------------------------------------+  |
|             |                                          |                              |
|  +---------------------------------------------------------------------------------+  |
|  |                           CLIENT STATE LAYER (Zustand)                          |  |
|  |  - WorkspaceStore (File tree, Active doc, Dirty status)                         |  |
|  |  - SyncEngine (EventSource SSE, Reconnection, Conflict Toast)                   |  |
|  |  - AutosaveManager (300ms Debounce, LocalStorage Draft Cache, Flush on Unmount) |  |
|  +---------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------+
                                |                             ^
               HTTP REST API    |                             | Server-Sent Events (SSE)
           (/api/workspace/*)   v                             | (/api/workspace/events)
+---------------------------------------------------------------------------------------+
|                                DENO BACKEND API (Port 3001)                           |
|  - Workspace FS (Atomic Writes, Mutex Locks)      - EventHub (Deno.watchFs)           |
|  - HTML Injector (Tailwind + Theme + Broker JS)   - Brain Agent / Gemini Tools        |
+---------------------------------------------------------------------------------------+
```

### 2.2. Phân rã Component (Component Decomposition Hierarchy)

```text
<AppShell>
  ├── <AppHeader>
  │     ├── <WorkspaceBrand> (Logo, Tên Workspace)
  │     ├── <Breadcrumbs> (Đường dẫn file hiện tại)
  │     ├── <SyncStatusDot> (Xanh: Connected | Đỏ: Reconnecting | Vàng: Saving)
  │     ├── <ThemeToggle> (Light/Dark mode)
  │     └── <AiDrawerButton> (Mở/Đóng Copilot chat)
  │
  ├── <AppBody> (Flex Row)
  │     ├── <Sidebar>
  │     │     ├── <SidebarActions> (Nút Tạo Note mới, Tạo Nợ mới, Tạo Folder)
  │     │     ├── <FileTreeSection title="Daily Work" path="daily/" />
  │     │     ├── <FileTreeSection title="Debts" path="debts/">
  │     │     │     └── <CollapsibleFolder title="Archive" path="debts/archive/" />
  │     │     ├── <FileTreeSection title="HTML Apps" />
  │     │     └── <FileTreeSection title="Files" path="" /> (Thư mục tự do)
  │     │
  │     ├── <MainViewport> (Flex-1)
  │     │     ├── <ConnectingScreen> (Hiển thị khi API :3001 offline)
  │     │     ├── <HtmlAppViewer> (Khi activeFile kết thúc bằng .html)
  │     │     └── <EditorContainer> (Khi activeFile kết thúc bằng .md)
  │     │           ├── <FrontmatterInspector> (Badge Nợ, Trạng thái, Ngày, Tiền tệ)
  │     │           ├── <TiptapEditor> (WYSIWYG Mode)
  │     │           └── <SourceEditor> (Raw Markdown Mode)
  │     │
  │     └── <AiCopilotDrawer> (Slide-over panel bên phải, gọi /api/message)
  │
  ├── <StatusBar> (Thống kê từ, Encoding UTF-8, Thời gian lưu cuối)
  └── <GlobalOverlays>
        ├── <CommandPalette> (Kích hoạt bằng ⌘K / Ctrl+K)
        ├── <ConflictToast> (Thông báo khi file bị ghi đè ngầm)
        └── <DeleteUndoToast> (Cho phép Undo sau khi xóa file)
```

---

## 📡 BLOCK 3: API SPECIFICATIONS & COMMUNICATION PROTOCOLS (ĐẶC TẢ GIAO TIẾP)

Client Shell tương tác hoàn toàn với Deno API (`http://localhost:3001`) thông qua 3 kênh giao tiếp:

### 3.1. REST API Client Contract (`api-client.ts`)

| Phương thức | Endpoint | Payload / Params | Chức năng trên Client |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/workspace/fs/list?glob=**/*` | Query `glob` | Tải toàn bộ danh sách file cho Sidebar |
| `GET` | `/api/workspace/fs/read?path={path}` | Query `path` | Đọc chi tiết file: `{ frontmatter, body, size, modifiedAt }` |
| `POST` | `/api/workspace/fs/write` | `{ path, content, frontmatter }` | Lưu file toàn phần (ghi nguyên tử) |
| `POST` | `/api/workspace/fs/patch` | `{ path, patch: { frontmatter, body } }` | Patch từng phần của file Markdown |
| `POST` | `/api/workspace/debts/create` | `{ personName, amount, direction, ... }` | Tạo nhanh khoản nợ từ Form/Modal |
| `POST` | `/api/workspace/debts/{id}/settle` | Không | Đánh dấu nợ đã trả (backend tự dời file vào archive) |
| `DELETE`| `/api/workspace/debts/{id}` | Không | Xóa khoản nợ |
| `GET` | `/api/workspace/time` | Không | Lấy ngày hiện tại chuẩn theo timezone workspace |
| `POST` | `/api/message` | `{ message, sessionId }` | Gửi prompt trò chuyện với AI Copilot |

### 3.2. Giao thức Server-Sent Events (SSE Protocol)
* **Endpoint:** `GET /api/workspace/events`
* **Cơ chế Reconnect:** Tự động kết nối lại sau **3000ms** nếu đứt kết nối.
* **Xử lý Event:**
  ```json
  data: {
    "paths": ["daily/2026-08-20.md"],
    "kind": "modify"
  }
  ```
  * Nếu `paths` chứa `activeFilePath`:
    * Nếu `isDirty === false`: Gọi `readFile()` nạp lại nội dung mới nhất.
    * Nếu `isDirty === true`: Hiển thị `<ConflictToast>`.
  * Nếu `paths` là file khác hoặc thư mục: Gọi lại `fs.list()` để cập nhật cây Sidebar.

### 3.3. Giao thức Iframe PostMessage Bridge (Shell ↔ HTML App)
Mặc dù HTML App gọi Broker `window.workboost` để đọc/ghi dữ liệu, Shell vẫn cần đồng bộ giao diện với Iframe qua `postMessage`:
1. **Đồng bộ Theme:**
   * Khi Shell đổi theme: `iframe.contentWindow.postMessage({ type: 'WB_THEME_CHANGE', theme: 'dark' | 'light' }, '*')`
2. **Bắt Link ngoài:**
   * HTML App chạy script lắng nghe click: nếu `href` trỏ ra domain ngoài hoặc `target="_blank"`, yêu cầu Shell mở bằng trình duyệt hệ thống.

---

## 💾 BLOCK 4: DATA MODELS & STATE SCHEMAS (MÔ HÌNH DỮ LIỆU & TRẠNG THÁI)

### 4.1. Client TypeScript Interfaces

```typescript
// Trạng thái một file trong cây Sidebar
export interface FileNode {
  path: string;           // e.g. "debts/john-doe-a1b2.md"
  name: string;           // e.g. "john-doe-a1b2.md"
  relativePath: string;
  kind: 'daily' | 'debt' | 'debt-archive' | 'html-app' | 'markdown' | 'folder';
  isArchived?: boolean;
  modifiedAt?: string;
  children?: FileNode[];  // Dùng khi kind === 'folder'
}

// Cấu trúc tài liệu đang chỉnh sửa
export interface ActiveDocument {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  rawMarkdown: string;
  size: number;
  modifiedAt: string;
  isDirty: boolean;       // True nếu có thay đổi chưa lưu
  lastSavedAt?: Date;
}

// Frontmatter chuẩn cho Debt (dùng cho FrontmatterInspector)
export interface DebtInspectorData {
  id: string;
  personName: string;
  amount: number;
  currency: string;
  direction: 'lent' | 'borrowed';
  status: 'pending' | 'paid' | 'cancelled';
  debtDate: string;
  paidAt?: string | null;
  updatedBy: string;
}
```

### 4.2. Máy Trạng thái Lưu file (Autosave State Machine)

```
     [User Types]
          │
          ▼
   ┌──────────────┐   (Within 300ms)    ┌──────────────┐
   │   DIRTY      │ ──────────────────> │  DEBOUNCING  │
   └──────────────┘                     └──────────────┘
          │                                    │
(User navigates away /                         │ (300ms Timeout expires)
 Tab switch / Unmount)                         │
          │                                    ▼
          │                            ┌──────────────┐
          └──────────────────────────> │   SAVING     │──> POST /api/workspace/fs/write
                                       └──────────────┘
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                         [HTTP 200 OK]                [Network Error]
                                 │                           │
                                 ▼                           ▼
                        ┌──────────────┐            ┌─────────────────┐
                        │    CLEAN     │            │ OFFLINE CACHED  │
                        └──────────────┘            │ (localStorage)  │
                                                    └─────────────────┘
```

---

## 🎨 BLOCK 5: UI/UX SPECIFICATIONS & INTERACTION FLOWS (THIẾT KẾ GIAO DIỆN)

### 5.1. Bố cục Màn hình Chuẩn (Standard Desktop Layout Grid)

```text
+-----------------------------------------------------------------------------------------------+
| [⚡ Work Boost] | 📁 workspace / debts / 💰 john-doe.md             [🟢 Connected] [🌙] [🤖 AI] |
+---------------------+-------------------------------------------------------------------------+
| 🔍 Quick Search...  |  DEBT PROPERTIES                                                        |
| + Note  + Debt  + 📁 |  Person: [ John Doe ]     Amount: [ 500,000 ₫ ]      Status: [ Pending ▼] |
+---------------------+-------------------------------------------------------------------------+
| ▼ 📅 DAILY WORK     |                                                                         |
|   📄 2026-08-20     |  # Tiền ăn trưa quán gà                                                 |
|   📄 2026-08-19     |                                                                         |
|                     |  John vay tiền ăn trưa cùng team.                                       |
| ▼ 💰 DEBTS          |  - [x] Ăn gà rán sốt cay                                                |
|   💰 john-doe (500k)|  - [ ] Nhắc trả vào thứ 6 tuần này                                      |
|   💰 alice (200k)   |                                                                         |
|   ▶ 📁 Archive (3)  |                                                                         |
|                     |                                                                         |
| ▼ 📱 APPS           |                                                                         |
|   📱 debt-tracker   |                                                                         |
|   📱 standup-viewer |                                                                         |
+---------------------+-------------------------------------------------------------------------+
| UTF-8 | Markdown    | 32 words | 240 chars                                 Saved: Just now    |
+-----------------------------------------------------------------------------------------------+
```

### 5.2. Luồng Tương tác Chính (Core Sequence Flows)

#### Luồng 1: Telegram Bot ghi nợ ➔ Giao diện tự động Reload thời gian thực
1. Người dùng gửi tin nhắn Telegram: *"Cho Nam vay 200k ăn tối"*.
2. Telegram Bot gọi Gemini ➔ Brain Agent gọi `create_debt` ➔ Ghi file `debts/nam-xxxx.md` trên đĩa.
3. Backend `Deno.watchFs` phát hiện file mới ➔ Bắn event SSE `{ paths: ['debts/nam-xxxx.md'], kind: 'create' }`.
4. Client Shell nhận event SSE ➔ Tự động thêm dòng `💰 nam (200k)` vào Sidebar mà người dùng không cần F5.

#### Luồng 2: Mở và Thao tác trên HTML App
1. Người dùng click chọn `debt-tracker.html` trên Sidebar.
2. Shell kích hoạt `<HtmlAppViewer filename="debt-tracker.html">`.
3. Iframe tải trang từ `http://localhost:3001/workspace-apps/debt-tracker.html` (đã được inject Tailwind, Alpine.js, theme CSS và Broker).
4. HTML App tự động gọi `window.workboost.debts.getSummary()` để render biểu đồ.
5. Khi người dùng bấm nút *"Đã trả"* trong HTML App ➔ Broker gọi API `POST /debts/:id/settle` ➔ File được dời vào `debts/archive/` ➔ Bắn SSE cập nhật lại Sidebar.

---

## 🛠️ BLOCK 6: IMPLEMENTATION PLAN & DIRECTORY STRUCTURE (KẾ HOẠCH TRIỂN KHAI)

### 6.1. Cấu trúc Thư mục Package `apps/web`

```text
apps/web/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppHeader.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── SidebarTree.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── editor/
│   │   │   ├── EditorContainer.tsx
│   │   │   ├── FrontmatterInspector.tsx
│   │   │   ├── TiptapEditor.tsx
│   │   │   └── SourceEditor.tsx
│   │   ├── viewer/
│   │   │   └── HtmlAppViewer.tsx
│   │   ├── ai/
│   │   │   └── AiCopilotDrawer.tsx
│   │   ├── palette/
│   │   │   └── CommandPalette.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Badge.tsx
│   │       ├── Dropdown.tsx
│   │       ├── Modal.tsx
│   │       └── Toast.tsx
│   ├── store/
│   │   ├── workspace-store.ts
│   │   └── ui-store.ts
│   ├── hooks/
│   │   ├── useWorkspaceSync.ts
│   │   ├── useAutosave.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── markdown-parser.ts
│   │   └── formatters.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
└── deno.json
```

### 6.2. Phân chia Task Chi tiết (Sprint Breakdown)

* **TASK 4.1: Khởi tạo Project & API Client Foundation**
  * Setup Vite + React 19 + Tailwind v4 trong `apps/web`.
  * Viết `api-client.ts` đóng gói các API gọi tới `localhost:3001`.
* **TASK 4.2: Xây dựng Layout Frame, Sidebar Cây Thư Mục & SSE Hook**
  * Xây dựng `SidebarTree` gom nhóm `daily/`, `debts/`, `apps/`.
  * Tích hợp hook `useWorkspaceSync` kết nối SSE `/api/workspace/events`.
* **TASK 4.3: Xây dựng Sandboxed HTML App Viewer**
  * Tạo component `HtmlAppViewer` chạy mượt mà 2 app `debt-tracker.html` và `standup-viewer.html`.
* **TASK 4.4: Xây dựng Markdown Editor & Frontmatter Inspector**
  * Tích hợp Tiptap WYSIWYG + Source Editor chuyển đổi qua phím tắt.
  * Tích hợp thanh `FrontmatterInspector` có autosave debounced 300ms.
* **TASK 4.5: Xây dựng AI Copilot Drawer & Command Palette**
  * Khung chat AI trượt bên phải kết nối `/api/message`.
  * Command Palette (`⌘K`) tìm kiếm nhanh và tạo file.
* **TASK 4.6: Kiểm thử E2E & Tối ưu hóa UI Polish**
  * Test đồng bộ 2 chiều giữa Telegram Bot và Web Client.
  * Đảm bảo không gián đoạn luồng người dùng khi bot ghi file dưới đĩa.

---

### 🚀 BƯỚC TIẾP THEO

Bản **Master SDD Giai đoạn 4** đã hoàn thiện 100% chuẩn mực và sẵn sàng thực thi. 

Bạn có muốn bắt đầu ngay với **TASK 4.1: Khởi tạo cấu trúc package `apps/web` (Vite, React 19, Tailwind CSS, API Client)** không?
