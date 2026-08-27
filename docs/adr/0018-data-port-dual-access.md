---
type: ADR
id: "0018"
title: "DataPort abstraction for dual-port data access"
status: active
date: 2026-08-27
---

## Context

In bundled desktop builds (`tauri build`, `custom-protocol` feature enabled), the Tauri shell
blocks startup until the Deno API sidecar starts (up to 40 seconds: 20s for port report + 20s for
TCP connect). If the compiled sidecar binary is incompatible, missing, or crashes, the app either
fails to launch entirely or shows "Connecting..." forever. Every workspace operation - listing
files, reading a document, saving edits - requires the sidecar.

This does not affect dev builds (`tauri dev`, no `custom-protocol`): those never spawn a sidecar
and point at a separately started `deno task dev` on port 3001.

The frontend currently has a single `api` object with hardcoded `fetch()` calls. There is no
interface - consumers import and call `api.*` directly. This means every workspace operation must
go through HTTP to the sidecar, with no alternative path.

Two deployment topologies exist (browser/dev-desktop via HTTP, bundled desktop via sidecar), but
both funnel through the same concrete HTTP transport. A broken sidecar makes the bundled desktop
completely non-functional.

## Decision

**Introduce a `DataPort` interface that the frontend workspace store and copilot adapter program
against, with two implementations: `HttpDataPort` (browser, dev-desktop) and `TauriDataPort`
(bundled desktop).**

`TauriDataPort` routes workspace file operations (list, read, write, create, move, trash, restore,
mkdir) through Tauri IPC commands backed by Rust raw file I/O on `~/.workboost/workspace/`. AI
operations, auth, and domain operations (debts, daily) continue through HTTP to the sidecar when
available, or return typed "unavailable" errors when not.

The Rust side provides only raw file I/O primitives. Domain logic (markdown parsing, path
validation, trash journal protocol) lives in shared TypeScript packages that both the server
route handler and the TauriDataPort import.

This is a dual-port architecture - two deployment topologies sharing an interface - not a
local-cloud sync system. No CRDTs, no convergence, no sync.

## Options considered

- **Option A: Fix sidecar reliability** - harden the spawn/retry logic so the sidecar always
  starts. Reduces failure frequency but cannot eliminate it (binary compatibility, missing
  runtime, OS-level issues). Does not address the fundamental single-point-of-failure.

- **Option B: DataPort abstraction** (chosen) - introduce an interface with two implementations.
  The editor works immediately via Tauri IPC. AI features activate when the sidecar is ready.
  Decouples the core editing experience from the sidecar lifecycle.

- **Option C: Port all server logic to Rust** - rewrite `packages/data-provider` in Rust so
  the desktop app has zero dependency on the sidecar for any operation. Enormous effort, would
  require maintaining parallel implementations, and AI features still need an API process.

## Consequences

**Positive:**
- Bundled desktop opens instantly and the file tree, read, write, save work without the sidecar
- AI features degrade gracefully (starting/unavailable states) instead of breaking the whole app
- Browser and dev-desktop paths are completely unchanged (HttpDataPort wraps existing `api`)
- Shared workspace logic (path validation, extension whitelist, trash types) is extracted into
  reusable packages, improving testability and consistency
- Extension whitelist is unified across server, brain tools, and WorkspaceFS (currently 3 copies
  that disagree)

**Negative:**
- Two markdown parsers remain (server: full YAML, renderer: scalar-only). Conformance test suite
  catches divergence at CI time but does not eliminate the gap.
- Trash journal protocol is duplicated between server route handler and TauriDataPort (shared
  types/validation, but the FS operations are port-specific)
- Two concurrent writers possible when sidecar is running (brain tools via WorkspaceFS +
  TauriDataPort via Rust IPC). Mitigated by compare-and-swap on both paths.
- More surface area: Rust workspace commands, TauriDataPort, watcher, sidecar lifecycle all
  need maintenance.

**Re-evaluation triggers:**
- If the sidecar is removed entirely (all logic moves to Rust or browser)
- If a cloud-hosted API replaces the sidecar
- If nested YAML frontmatter is introduced (would require unifying the two parsers)
