---
type: ADR
id: "0008"
title: "Run the Deno API as a Tauri 2 sidecar in the desktop shell"
status: active
date: 2026-08-22
---

## Context

Work Boost ships a browser shell (`apps/web`, Vite + React 19) and a Deno HTTP API (`apps/api`) that
owns the Markdown-first workspace, the agent/assistant transcript, and all OAuth credentials. There is
no desktop target.

A desktop app is wanted for a native installable experience (window, dock/taskbar icon, tray,
notifications). The constraint is to reuse the existing frontend and backend rather than fork them.
The frontend and API already communicate over HTTP + SSE, and the frontend resolves its API base at
startup (`VITE_API_BASE` or `/api`). The current API CORS allowlist only covers browser origins
(`http://localhost:3000`, `http://localhost:3001`).

## Decision

**Add a thin `apps/desktop` Tauri 2 shell that reuses `apps/web` as its webview and runs the existing
Deno API as a bundled sidecar, spawned and killed from the Rust shell over a loopback port.**

Specifically:

- `apps/desktop` contains only the Tauri Rust shell (`src-tauri`). It points `frontendDist` at the
  `apps/web` build output and `devUrl` at the Vite dev server.
- The API is compiled with `deno compile` into a single executable and listed under
  `bundle.externalBin` (with the `-<target-triple>` suffix). Compile with `--unstable-cron` for Deno 2.x cron support (tested with Deno 2.1+). The Rust `setup()` spawns it bound to `127.0.0.1:<port>` and
  kills it on exit.
- The sidecar reads the loopback port/host from env (`WORKBOOST_PORT`, `WORKBOOST_HOST`) rather than
  the hardcoded `3001`/`0.0.0.0` in `apps/api/src/main.ts`. Binding loopback is a security
  requirement; `/api`, `/auth`, `/v1`, and `/message` are not loopback-gated (only workspace routes
  are).
- A `get_api_base()` Tauri command returns the live `http://127.0.0.1:<port>/api` base; the webview
  calls it at startup and falls back to `VITE_API_BASE`/the default when running outside Tauri. This
  requires refactoring `apps/web/src/lib/api-client.ts` so the base is not a module-load constant,
  and gating render until the base resolves.
- The API CORS allowlist is extended with the Tauri webview origins (`tauri://localhost` on
  macOS/Linux, `http://tauri.localhost` on Windows).
- OAuth URLs are opened in the system browser via `tauri-plugin-opener`, registered in Rust and
  granted the `opener:default` permission (which already allows `https://`); credential handling
  stays in the API's `AuthService` (see ADR 0007). No `plugins.opener` block in `tauri.conf.json`.
- Workspace persistence stays with the API. The desktop frontend keeps using the API's
  `/workspace/fs/*` and `/workspace/events` routes; no Tauri `fs` permission scope is added.
- The webview capability set is `core:default` + `opener:default`; no `shell:*` permission (the
  sidecar is spawned from Rust only). A scoped CSP replaces `csp: null` to allow the invoke IPC
  (`ipc: http://ipc.localhost`) and cross-origin calls to `http://127.0.0.1:*`.

## Options considered

- **A. Deno API as a `deno compile` sidecar** (chosen): maximum reuse; the API remains the source of
  truth; no Rust rewrites; a single self-contained executable is easy to ship and install.
- **B. Point the desktop app at a remote/self-hosted API**: loses local-first and offline workspace
  ownership; contradicts the Markdown-first local architecture.
- **C. Move backend logic into Rust Tauri commands**: large rewrite of assistant/auth/workspace
  logic and creates a second divergent implementation.
- **D. Embed the API in the Rust process (Rust HTTP server)**: would require porting the Deno
  service; does not reuse the existing API code.
- **E. Host the static frontend at a same-origin server**: does not deliver the installed-app
  distribution/identity the task requires.

## Consequences

- The team gains a native desktop distribution while keeping the Vite frontend and Deno API intact.
- Adds a Rust build artifact and platform webview/system dependencies to a Deno/TypeScript project;
  the Rust surface is intentionally minimal, but the build and release matrix grows.
- The API must be compiled per target triple for the sidecar, and its CORS allowlist must include the
  Tauri webview origins or fetch/SSE calls fail.
- The frontend bootstrap must tolerate the absence of Tauri (for the browser build and tests) and must
  resolve the API base at runtime rather than baking a fixed port.
- Packaging must not embed real credentials. `.workboost/config.json` only holds non-secret AI
  provider/model; real keys come from env vars and the `~/.pi` credential store. **Future work**:
  the Rust shell should load `~/.workboost/.env` before spawning the sidecar and pass those values
  as environment variables, so GUI launches receive user-level credentials without embedding secrets.
- The sidecar build uses `--unstable-cron` and has been smoke-tested for `Deno.cron` (used by
  `schedulerExtension`); the rest of the API's unstable surface (KV) is not used in production.
- The implementation includes port/host env parsing in `apps/api/src/main.ts` and a
  runtime-configurable API base in `apps/web/src/lib/api-client.ts`.
- Dev needs the API running separately (or the sidecar spawned in dev); `beforeDevCommand` only starts
  the web server. Tray/notifications cannot rely on the webview SSE when the window is closed.

## Advice

This captures the recommendation from the desktop shell spec, refined by a review of that spec against
the codebase and Tauri 2 / Deno docs (see the review note in `docs/plans/`). It is recorded as
`proposed` because the remaining validation is the runtime blast radius of compiling the API: confirm
`Deno.cron` still fires inside the compiled sidecar, and decide whether dev spawns the sidecar too or
keeps the Vite proxy plus a separate `deno task dev` terminal. After that, promote to `active`.
