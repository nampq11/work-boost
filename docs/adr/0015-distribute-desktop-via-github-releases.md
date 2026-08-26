---
type: ADR
id: "0015"
title: "Distribute desktop installers as prebuilt GitHub Releases artifacts"
status: active
date: 2026-08-26
---

## Context

The desktop app (`apps/desktop`, Tauri 2) currently has no distribution channel: users must clone the
repository, install a Rust toolchain plus webview system libraries, and run `tauri build` themselves.
The CLI/API side can already be installed from source via `scripts/install.sh` (clone + Deno), but
that path cannot produce the native desktop shell.

Building the desktop app inside an installer script is not viable: it requires a ~1GB Rust toolchain,
Linux webview dev packages, ~700MB of npm dependencies, and 5-15 minutes of compile time. A one-line
`curl | sh` flow must not carry those requirements.

Tauri produces per-platform native bundles from `npm run build`: `.deb`/`.AppImage` (Linux),
`.dmg`/`.app` (macOS), `.msi`/`.exe` (Windows). These need to be built once on matching OS runners and
published somewhere users can download them.

## Decision

**Distribute desktop installers exclusively as prebuilt artifacts attached to GitHub Releases, built
by CI; `scripts/install.sh --desktop` downloads and installs the artifact for the detected platform.**

Specifically:

- A GitHub Actions workflow triggers on version tags (`v*`), builds the Tauri bundles on macOS,
  Ubuntu, and Windows runners, and attaches all bundles plus SHA256 checksums to the release.
- `scripts/install.sh` is desktop-only: it detects OS/arch, resolves the latest release via the
  GitHub API, verifies the checksum, and installs with the platform-native mechanism (package manager
  for `.deb`, mount/copy for `.dmg`). Because the sidecar embeds Deno and all npm dependencies, end
  users need nothing installed beyond curl.
- Windows users download the `.msi` directly; `curl | sh` does not apply there and the installer
  prints that instruction instead of attempting it.
- There is no scripted CLI/source install; contributors and terminal-first users clone the repository
  and run `deno task dev`/`deno task start` directly.

## Options considered

1. **Build desktop from source in install.sh** - rejected: toolchain weight and build time are
   unacceptable for first-run UX.
2. **Prebuilt artifacts on GitHub Releases** - chosen: zero infrastructure beyond Actions runners,
   standard download UX, works once the repository is public.
3. **Third-party update servers / app stores** - rejected for now: extra operational surface for no
   current need; Tauri's updater can be layered on top of Releases later if auto-update is wanted.

## Consequences

- Desktop installation is blocked until the repository is public and the workflow runs at least once;
  `--desktop` must fail gracefully when no release exists.
- Every user-facing desktop fix requires a tag push to become installable; contributors still build
  locally via `npm run build`.
- Release artifacts embed the Deno sidecar, so end users do not need Deno installed for the desktop
  path.
