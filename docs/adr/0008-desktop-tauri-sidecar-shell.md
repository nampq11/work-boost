---
type: ADR
id: "0008"
title: "Run the Deno API as a Tauri 2 sidecar in the desktop shell"
status: proposed
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
  `bundle.externalBin` (with the `-<target-triple>` suffix). The Rust `setup()` spawns it on a
  loopback port and kills it on exit.
- A `get_api_base()` Tauri command returns the live `http://127.0.0.1:<port>/api` base; the webview
  calls it at startup and falls back to `VITE_API_BASE`/the default when running outside Tauri.
- The API CORS allowlist is extended with the Tauri webview origins (`tauri://localhost` on
  macOS/Linux, `http://tauri.localhost` on Windows).
- OAuth URLs are opened in the system browser via `tauri-plugin-opener`; credential handling stays in
  the API's `AuthService` (see ADR 0007).
- Workspace persistence stays with the API. The desktop frontend keeps using the API's
  `/workspace/fs/*` and `/workspace/events` routes; no Tauri `fs` permission scope is added.

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
- Packaging must not embed real credentials; AI/provider settings should come from the workspace-local
  `.workboost/config.json` and the `~/.pi` credential file.
- Re-evaluate if the API stops being runnable as a `deno compile` sidecar (e.g. the `--unstable-kv` /
  `--unstable-cron` behavior is not preserved), or if a server-based (non-local) deployment becomes the
  primary model.

## Advice

This captures the recommendation from the desktop shell spec. It is recorded as `proposed` because two
open items should be validated before the decision becomes `active`: (1) `deno compile` preserving the
API's `--unstable-kv` / `--unstable-cron` behavior inside the sidecar, and (2) the loopback port
strategy for exposing the resolved API base to the frontend.
