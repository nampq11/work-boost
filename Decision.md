# Implementation decisions

## 2026-08-20 - Workspace shell implementation

- The specification defines the trash and undo behavior but not endpoint names. The implementation uses `DELETE /api/workspace/fs/delete`, `POST /api/workspace/fs/restore`, and `POST /api/workspace/fs/folder` so the web shell can expose the required behavior without coupling it to the debt repository.
- The Copilot uses the existing synchronous `POST /api/message/sync` endpoint. The documented `POST /api/message` endpoint intentionally remains asynchronous for bot clients, so the browser does not receive an empty 202 response when it expects an answer.
- Markdown saves use `expectedModifiedAt` and return `409 CONFLICT` when the on-disk version changed. This is an additive conditional-write contract required to make the specification's conflict warning safe against the race between an SSE notification and a user save.
- HTML apps are loaded in an iframe with only `allow-scripts allow-forms`. The backend CSP keeps `allow-same-origin` for compatibility with existing seeded apps, but the iframe sandbox omits it, giving the app an opaque origin and preventing host cookie/storage access. External links are mediated by a validated `postMessage` bridge.
- The web shell uses Vite with React 19, Zustand, Tiptap, and Tailwind v4 through `apps/web/deno.json`; the existing Deno API remains the source of truth for workspace files and events.

## 2026-08-20 - Development SSE cancellation handling

- The specification does not define development-server logging. Expected SSE disconnects now close the server stream on `Request.signal.abort`, and both Deno's `onError` hook and Vite filter only cancellation errors; non-cancellation failures remain visible. Root web tasks run with `--cwd apps/web` so Vite owns its package-local lifecycle.
