# Architecture

Work Boost is a local-first workspace for daily work notes and debt tracking. Users interact through
the browser workspace, the AI copilot, or optional Slack and Telegram integrations. The user's
Markdown workspace is the durable source of truth.

```text
Browser workspace ───────┐
Desktop shell (Tauri 2) ─┤
Slack / Telegram ────────┼── API composition ── Data layer ── Markdown workspace
                         │          │
                         │          ├── Brain ── Workspace tools
                         │          └── Extensions ── webhooks and scheduled jobs
                         └── HTTP and SSE
```

The API process creates the data layer, compatibility database facade, Brain, and enabled
extensions. Browser clients and the Brain both reach workspace data through application APIs rather
than direct filesystem access.

## Code map

### `apps/api`

The Deno HTTP application and composition root.

- `main.ts` starts the service, seeds bundled HTML apps, and shuts services down.
- `bootstrap.ts` validates configuration and constructs shared services.
- `server.ts` owns HTTP routing, CORS, headers, rate limiting, and extension dispatch.
- `routes/message.ts` exposes the agent message and session-reset API.
- `routes/workspace.ts` exposes the loopback-only workspace API, SSE change feed, and HTML-app
  server.
- `routes/auth.ts` exposes API-owned OAuth status, device-code progress, cancellation, and logout.
- `routes/assistant.ts` exposes the assistant thread API under `/api/v1`: thread and message CRUD
  plus response submission with streamed response events.

HTTP request and response details end here. Use package APIs and ports below this layer.

### `apps/web`

The Vite and React workspace editor. `App` assembles the editor, file tree, HTML-app viewer, and
copilot. The Zustand workspace store owns browser state, drafts, optimistic-concurrency revisions,
and workspace change synchronization. The store is created by `createWorkspaceStore(port)` bound to
the active `DataPort` (see the DataPort section below); `api-client.ts` is the HTTP boundary used by
`HttpDataPort`. The Copilot uses an assistant-ui local runtime for the current page only: on mount
it creates a server-side assistant thread (`POST /api/v1/threads`), sends turns through
`/api/v1/threads/:id/responses`, and streams response events over SSE, falling back to
`/api/message/sync` when the thread API is unavailable. The Brain remains the server-side transcript
owner, and closing the drawer does not destroy the runtime. When the sidecar is starting or failed
(bundled desktop), the copilot drawer and Today debt/daily sections show a graceful unavailable
state instead of erroring.

### `packages/data-schemas`

The shared domain vocabulary: validated workspace configuration, daily-work documents, debts, and
compatibility shapes. It contains domain types and validation, not orchestration or persistence
behavior.

### `packages/data-provider`

The persistence boundary. `DataLayer` combines `WorkspaceFS`, `ConfigManager`,
`DailyWorkRepository`, and `DebtRepository`.

- `WorkspaceFS` owns safe, atomic access to `~/.workboost/workspace`.
- Configuration is stored in `.workboost/config.json`.
- Daily reports are stored as `daily/YYYY-MM-DD.md`.
- Active debts are stored in `debts/`; terminal debts move to `debts/archive/`.

`Database` is a compatibility facade for legacy callers. New storage work belongs on `DataLayer`
repositories.

### `packages/brain`

The AI boundary. `Brain` implements `AgentPort`, which is the interface used by the API and platform
adapters. It creates a Pi agent with a system prompt and atomic workspace tools, manages one
transcript per session, and returns response text to its caller. Its `AuthService` adapts pi-ai
OAuth interactions into safe API events without exposing credentials to clients.

`tools/` defines the operations available to the model: time lookup, debt management, daily-work
management, and workspace-file discovery. Tools use `DataLayer` repositories.

### `extensions`

The integration boundary. `ExtensionManager` initializes extensions and collects their routes and
cron jobs. `loader.ts` discovers user plugins in `~/.workboost/plugins`.

- `telegram/` adapts Telegram updates and commands. `wiring.ts` registers middleware and handlers;
  `telegram.ts` handles delivery and webhooks.
- `slack/` handles Slack webhooks and delivery.
- `scheduler/` registers daily summaries and debt reminders.
- `formatters/` contains presentation helpers.

The public surface is the contract (`types.ts`), the engine (`manager.ts`, `loader.ts`), and the
three built-in factories (`slackExtension`, `telegramExtension`, `schedulerExtension`). Internal
implementations stay out of the barrel so they can evolve without breaking consumers.

Extensions receive the shared `ExtensionContext`; they do not create another server, agent, or
persistence stack. A single `ExtensionMessageSender` in `types.ts` is implemented by each platform
service; `ExtensionContext.messaging` maps a platform to its sender.

### `apps/web` — DataPort abstraction

The frontend no longer imports the `api` client directly. All data access (workspace FS, AI, auth,
domain operations) goes through a `DataPort` interface. Two implementations exist:

- **`HttpDataPort`** — delegates every method to the existing HTTP `api` client. Used by the
  browser shell, cloud deployments, and dev-mode desktop builds.
- **`TauriDataPort`** — workspace FS operations (list, read, write, create, move, trash, restore,
  mkdir) go through Tauri IPC commands backed by Rust raw file I/O on `~/.workboost/workspace/`.
  AI, auth, and domain operations (debts, daily) go through HTTP to the sidecar when available, or
  throw a typed `DataPortUnavailableError` when not.

The workspace store exports a `createWorkspaceStore(port: DataPort)` factory and a
`WorkspaceStoreProvider` React context. The `DataPortProvider` is the root context that determines
which implementation to use based on the runtime environment.

### `apps/desktop`

The Tauri 2 native shell. It embeds the built `apps/web` frontend and talks to the same loopback API
as the browser. The sidecar lifecycle is now non-blocking:

- **Bundled builds** (`custom-protocol` feature): the workspace init (directory creation) and file
  watcher start synchronously, then the webview loads immediately. The Deno API sidecar is spawned
  in a background thread with `SidecarManager`; it reports `starting` -> `ready` or `failed` via
  Tauri events (`sidecar-ready`, `sidecar-failed`). The frontend's `TauriDataPort` subscribes to
  those events before querying `get_sidecar_status`; the query reconciles any transition that
  happened before subscription, so a `sidecar-ready` emitted during startup is never missed.
  AI features activate when the sidecar is ready; the editor works immediately.
- **Dev builds** (no `custom-protocol`): `SidecarState` is set to `Ready` with base
  `http://127.0.0.1:3001/api` immediately. No sidecar spawned. The frontend uses `HttpDataPort`
  and works exactly as before.

The Rust shell exposes raw file I/O commands (`workspace_read_file`, `workspace_write_file`,
`workspace_create_file`, `workspace_list_files`, `workspace_stat`, `workspace_move`,
`workspace_remove`, `workspace_mkdir`, `workspace_exists`, `workspace_init`) with path containment
via `std::fs::canonicalize` and compare-and-swap on `write_file`. The `notify`-based file watcher
emits `workspace-changed` events matching the server's event semantics.

### `packages/runtime` and `packages/shared`

`packages/runtime` ships user-editable HTML workspace apps and injects their restricted
`window.workboost` broker when served. It never overwrites an existing user app. `packages/shared`
holds environment access, logging, and security helpers.

## Architectural invariants

1. **Markdown is authoritative.** Configuration, daily work, and debts are workspace files. Do not
   introduce a second persistent source of truth.
2. **Workspace files are accessed through `WorkspaceFS`/repositories or the Rust IPC commands.**
   Direct workspace I/O bypasses path containment, locks, atomic writes, and conditional-update
   semantics. The Rust `workspace_*` commands replicate those guarantees (canonicalize-based
   containment, atomic create, compare-and-swap).
3. **The browser and HTML apps are clients, not filesystem peers.** They use the localhost-only
   workspace API. HTML apps are sandboxed and get only the broker API.
4. **The model changes data only through declared tools.** Add an atomic tool for a new agent
   operation rather than creating a prompt-level or adapter-level backdoor.
5. **`AgentPort` hides the agent implementation.** API routes and platform adapters must not depend
   on Pi internals or session storage.
6. **A session processes one turn at a time.** The Brain queues by session ID to preserve transcript
   order; different IDs isolate conversation history.
7. **Workspace apps and plugins are user-owned.** Bundled apps seed only when absent, and a plugin
   failure must not prevent the core application from starting.
8. **OAuth belongs to the API process.** Browser clients receive only authentication status and
   device-code progress; tokens remain in the server-side pi credential store.
9. **The browser Copilot does not own transcript persistence.** Its assistant-ui runtime is an
   in-memory presentation state for one page-scoped session. The API and Brain own the transcript,
   which `AssistantService` persists under `.workboost/assistant/threads`; a refresh deliberately
   creates a new thread rather than reusing an old Brain session.

## System boundaries

```text
Configured model provider ── packages/brain ┐
Slack / Telegram ── extensions ─────────────┼── apps/api ── packages/data-provider
Browser and HTML apps ── HTTP / SSE ────────┤                           │
Desktop shell (Tauri 2) ────────────────────┘                           ▼
                                                             ~/.workboost/workspace
```

- **HTTP:** `apps/api` converts external requests into application calls and failures into HTTP
  responses.
- **Desktop:** `apps/desktop` is a thin shell over the web frontend. In bundled builds it owns
  non-blocking sidecar lifecycle, raw workspace file I/O commands, a launch-time read-only release
  check, and the elevated apply-update path. Workspace editing works without the sidecar via the
  Rust commands; AI and domain features use the sidecar when it is ready.
- **DataPort:** the frontend programs against the `DataPort` interface. `HttpDataPort` (browser,
  dev desktop) and `TauriDataPort` (bundled desktop) implement it; the workspace store and copilot
  adapter never touch a concrete transport.
- **AI:** `AgentPort` hides the model provider, tool loop, prompt, and transcript retention.
- **Persistence:** `DataLayer` hides the workspace layout and Markdown serialization.
- **Integrations:** extensions contain external protocol handling, delivery, and scheduling.
- **Browser:** `api-client.ts` and the injected broker are the browser-facing APIs.

## Cross-cutting concerns

- **Concurrency:** `WorkspaceFS` and repositories serialize writes. Browser saves use
  `expectedModifiedAt` to reject stale writes, while the workspace watcher publishes SSE changes.
- **Security:** the server applies CORS, security headers, input validation, and message rate
  limiting. Workspace routes are loopback-only, validate paths and file types, and sandbox HTML
  apps. Platform adapters validate their webhook credentials.
- **Lifecycle:** startup validates required secrets before service construction. Extension and
  plugin failures are isolated and logged; shutdown stops the server, workspace watcher, and
  initialized extensions.
- **Testing and observability:** tests target observable package and HTTP boundaries, using
  temporary workspaces and external-service fakes where appropriate. `packages/shared/logger` is the
  common logging boundary.
