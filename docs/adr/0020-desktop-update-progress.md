---
type: ADR
id: "0020"
title: "Stream in-app update progress out-of-band via a scratch progress file"
status: active
date: 2026-08-27
---

## Context

The self-update flow (ADR 0016) runs `scripts/install.sh` elevated via `pkexec` (Linux) or
`osascript ... with administrator privileges` (macOS). The initial `apply_update` command blocked
until the installer exited, so the webview could only show a generic `Updating...` for the whole
duration. Users could not tell whether the app was making progress, whether they still needed to
authenticate, or whether they should force-quit.

To fix this we must surface the install phases (`waiting-for-permission`, `downloading`,
`installing`, `restarting`) to the UI while the app stays open. The hard part is getting the
installer's progress out of a process that runs elevated and wraps the script indirectly:

- macOS `osascript` captures the whole `do shell script` output and only returns it when the script
  finishes, so it does NOT stream intermediate lines.
- Both `pkexec` and `osascript` reset or curate the child environment, so passing a path via an
  environment variable is unreliable.
- The webview must never pass the install URL to Rust (ADR 0016), so progress cannot be reported by
  the webview fetching anything.

## Decision

**Relay update progress via a scratch file that `install.sh` appends markers to, tailed by a Rust
background thread that emits Tauri events. Do not rely on streaming the elevated process output and
do not read a path from the webview.**

- `apply_update` spawns a Rust background thread and returns immediately; progress and the terminal
  failure are delivered as `update:phase` / `update:error` Tauri events.
- Rust generates a unique scratch path in the shared temp dir (pid + nanosecond suffix) and passes it
  to the installer as `$1`; the webview never supplies the path.
- `install.sh` gains an optional `$1` progress file and appends `phase:<name>` markers (and
  `error:<message>` on failure). Manual `curl ... | sh` usage passes no argument and writes nothing.
- The elevated wrapper invokes the script as `curl ... | sh -s -- <path>`, which reads the script
  from stdin while exposing the path as `$1`, so no environment-variable propagation is needed.
- Rust tails the file (advancing only past newline-terminated lines so a torn trailing write is
  retried) and emits phase events; on installer exit it emits `restarting` and relaunches, or
  `failed` plus the installer's own error message.

## Options considered

1. **Stream the elevated process stdout/stderr and parse `[install]` log lines (chosen
   initially, rejected)** - simplest to write, but macOS `osascript` buffers and returns the whole
   `do shell script` output only on completion, so intermediate download/install phases would be
   invisible on macOS.
2. **Pass the progress path via an environment variable** - rejected because `pkexec` resets the
   child environment (only a curated set is preserved) and `osascript`'s `do shell script` does not
   reliably inherit caller env vars under elevation.
3. **Scratch progress file tailed by Rust (chosen)** - works on both platforms regardless of the
   wrapper's buffering, keeps the webview out of the path contract, and survives the root/user
   permission split because the exact absolute path is passed as an argument and root can write to
   it. Adds a small tailer and a temp-file lifecycle.
4. **Reimplement download/install in Rust for full phase control** - rejected by ADR 0016: it would
   need webview-supplied URLs (XSS-to-root vector) and duplicate `install.sh` logic.
5. **Adopt the Tauri updater plugin** - rejected by ADR 0016 (signing/AppImage/notarization).

## Consequences

- Users see live install phases and are told the app stays open and will restart automatically,
  making a normal update look like progress rather than a hang.
- The webview still never supplies the install URL or the progress path to Rust; the path is
  generated Rust-side, preserving the ADR 0016 trust boundary.
- `install.sh` remains the canonical installer and still works via plain `curl ... | sh` (no
  argument), so manual installs are unchanged.
- A stale/abandoned scratch file is possible if the process is killed mid-install; the unique
  pid+nano name prevents cross-run collisions and the file is cleaned up on a normal exit path.
- Progress granularity is driven by the markers `install.sh` chooses to emit; adding finer
  milestones later is a one-line `progress "phase:..."` change, not a Rust change.
- Re-evaluate if the project adopts the Tauri updater plugin (signed artifacts), which would replace
  this bespoke install path entirely (ADR 0016).
