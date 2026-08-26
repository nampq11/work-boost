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
and SSE synchronization. `api-client.ts` is its HTTP boundary. The Copilot uses an assistant-ui
local runtime for the current page only: on mount it creates a server-side assistant thread
(`POST /api/v1/threads`), sends turns through `/api/v1/threads/:id/responses`, and streams response
events over SSE, falling back to `/api/message/sync` when the thread API is unavailable. The Brain
remains the server-side transcript owner, and closing the drawer does not destroy the runtime.

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

### `apps/desktop`

The Tauri 2 native shell. It embeds the built `apps/web` frontend and talks to the same loopback API
as the browser. In bundled builds it spawns a compiled Deno API sidecar bound to `127.0.0.1:0`,
reads the assigned port from the sidecar's `PORT:<n>` stdout line, exposes it to the frontend
through a `get_api_base` command, and kills the child on exit. In dev it points at a separately
started API (`deno task dev`, port 3001) so a stale sidecar binary cannot break startup.

### `packages/runtime` and `packages/shared`

`packages/runtime` ships user-editable HTML workspace apps and injects their restricted
`window.workboost` broker when served. It never overwrites an existing user app. `packages/shared`
holds environment access, logging, and security helpers.

## Architectural invariants

1. **Markdown is authoritative.** Configuration, daily work, and debts are workspace files. Do not
   introduce a second persistent source of truth.
2. **Workspace files are accessed through `WorkspaceFS` or repositories.** Direct workspace I/O
   bypasses path containment, locks, atomic writes, and conditional-update semantics.
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
- **Desktop:** `apps/desktop` is a thin shell over the web frontend; it owns only sidecar lifecycle,
  a launch-time read-only release check, and the elevated apply-update path, and never bypasses the
  HTTP API.
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
