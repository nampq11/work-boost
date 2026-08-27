---
type: ADR
id: "0019"
title: "Proxy bundled sidecar HTTP through the Rust shell"
status: active
date: 2026-08-27
---

## Context

ADR 0018 gives `TauriDataPort` two legs: workspace FS via Tauri IPC, and AI / auth / domain
operations (threads, responses, auth login, debts, daily) via HTTP to the loopback sidecar at
`http://127.0.0.1:<random-port>/api`. The HTTP leg was implemented as direct `fetch()` calls from
the webview.

In bundled builds the webview origin is `http(s)://tauri.localhost`. Every sidecar request is
therefore cross-origin to a random high port, and is subject to each webview's network policy:
WebKitGTK (Linux) CSP `connect-src` matching, CORS allowlists in the API (`https://tauri.localhost`
on macOS is not granted), and mixed-content blocking on the https macOS webview. Verified against
the shipped sidecar binary: the server responds correctly and grants CORS to
`http://tauri.localhost`, yet the bundled app still shows "Could not load today's data" and
"Load failed" for the copilot - the block is inside the webview, before the request reaches the
server. Dev builds are unaffected (`http://localhost:1420` to `127.0.0.1:3001` is loopback to
loopback) which is why the bug only appeared in production.

Patching per-webview policy (CSP wildcards, CORS entries, scheme settings) cannot fully solve it:
the port is random so it cannot be enumerated in a static CSP, and macOS mixed-content rules
apply regardless of CORS.

## Decision

**In bundled desktop builds, all sidecar HTTP traffic (JSON requests and SSE streams) is proxied
through the Rust shell instead of fetched by the webview.**

Two Tauri commands in `apps/desktop/src-tauri/src/sidecar.rs`:

- `sidecar_request(method, path, body)` - performs the request with `reqwest` against the sidecar
  URL taken from the authoritative `SidecarManager` state, returns `{ status, body }`.
- `sidecar_stream(method, path, on_event)` - performs an SSE request and forwards raw chunks to
  the renderer over a Tauri `Channel`, so the copilot keeps real-time deltas.

The renderer's `api-client.ts` exposes a pluggable transport (`setHttpFetch`) that defaults to
the browser `fetch`. `TauriDataPort.init()` installs a proxy implementation that maps `fetch`
calls onto those two commands (streaming when the request accepts `text/event-stream`). The
proxy derives the target URL from Rust state, not from the renderer's `apiBase` variable.
`subscribeAuthLogin` switched from `EventSource` to a fetch-based SSE reader so it can use the
same path; the workspace event stream is unaffected (bundled builds already use the Rust
watcher's `workspace-changed` events).

Browser and dev-desktop builds are unchanged: they never construct `TauriDataPort`, so the
transport stays the plain browser `fetch`.

## Options considered

- **Option A: Webview fetches the sidecar directly (previous behavior)** - broken in bundled
  builds; the cross-origin loopback fetch is filtered by webview policy before the server can
  respond.

- **Option B: Fix the webview policy** - enumerate CSP/CORS per platform. Cannot work fully: the
  ephemeral port cannot be listed in a static CSP, and macOS mixed-content blocking applies to
  any plain-http fetch from the https webview regardless of CORS.

- **Option C: Route through the Rust shell** (chosen) - the shell already owns the sidecar
  lifecycle, so it also performs its HTTP. No webview policy applies to a `reqwest` call, and
  the proxy resolves the sidecar URL from Rust state, removing the renderer-side base URL as a
  failure point. Cost: streaming responses need an explicit `Channel` bridge, and `AbortSignal`
  is not forwarded through the proxy (cancellation is not yet wired for proxied requests).

- **Option D: Drop the sidecar HTTP leg entirely** - move AI/auth/domain logic behind dedicated
  IPC commands like the workspace FS. Larger surface change; the HTTP API must still exist for
  the browser topology, so this only duplicates it.

## Consequences

- Bundled desktop AI / auth / debts / daily work regardless of webview CSP, CORS, and
  mixed-content policy, on every platform, with the sidecar still on a random port.
- Copilot response streaming stays incremental (SSE chunks forwarded over a `Channel`).
- Proxied requests do not forward `AbortSignal`; canceling a streaming run currently relies on
  the generator consumer stopping. Follow-up work if cancellation regressions appear.
- `reqwest` gains an async role in the shell (it was already a dependency for update checks).
- The renderer's `apiBase` is still set for URL construction, but the proxy no longer depends on
  it being correct; Rust state is authoritative.
- Extends ADR 0018 (the HTTP leg of `TauriDataPort` changes transport, not its role).
