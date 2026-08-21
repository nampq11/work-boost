# Implementation decisions

## 2026-08-20 - Workspace shell implementation

- The specification defines the trash and undo behavior but not endpoint names. The implementation uses `DELETE /api/workspace/fs/delete`, `POST /api/workspace/fs/restore`, and `POST /api/workspace/fs/folder` so the web shell can expose the required behavior without coupling it to the debt repository.
- The Copilot uses the existing synchronous `POST /api/message/sync` endpoint. The documented `POST /api/message` endpoint intentionally remains asynchronous for bot clients, so the browser does not receive an empty 202 response when it expects an answer.
- Markdown saves use `expectedModifiedAt` and return `409 CONFLICT` when the on-disk version changed. This is an additive conditional-write contract required to make the specification's conflict warning safe against the race between an SSE notification and a user save.
- HTML apps are loaded in an iframe with only `allow-scripts allow-forms`. The backend CSP keeps `allow-same-origin` for compatibility with existing seeded apps, but the iframe sandbox omits it, giving the app an opaque origin and preventing host cookie/storage access. External links are mediated by a validated `postMessage` bridge.
- The web shell uses Vite with React 19, Zustand, Tiptap, and Tailwind v4 through `apps/web/deno.json`; the existing Deno API remains the source of truth for workspace files and events.

## 2026-08-20 - Development SSE cancellation handling

- The specification does not define development-server logging. Expected SSE disconnects now close the server stream on `Request.signal.abort`, and both Deno's `onError` hook and Vite filter only cancellation errors; non-cancellation failures remain visible. Root web tasks run with `--cwd apps/web` so Vite owns its package-local lifecycle.

## 2026-08-21 - Configurable AI provider compatibility

- Workspaces without an `ai` section resolve to Google with `gemini-2.5-flash`. This preserves existing workspaces and the legacy `GOOGLE_API_KEY` setup while keeping new provider selection explicit through configuration or environment overrides.

## 2026-08-21 - Frontend OAuth login

- Browser authentication is implemented as an API-owned `AuthService` in `packages/brain`. The API exposes only safe status and progress metadata; pi-ai remains the owner of OAuth exchange and credential persistence.
- The first browser flow is intentionally limited to OpenAI Codex device-code OAuth. OpenRouter remains unsupported in the browser, matching the plan's remote-browser safety constraint.
- The plan does not define the response when login is requested for an already connected provider. The implementation returns `409 AUTH_ALREADY_CONNECTED` unless `reauthenticate: true` is sent, rather than creating a redundant session.
- SSE subscribers receive a bounded in-memory replay and disconnect-triggered cancellation waits one second for a reconnect. This preserves the plan's reconnect behavior while ensuring abandoned device flows do not run indefinitely.
