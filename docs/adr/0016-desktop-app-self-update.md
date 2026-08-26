---
type: ADR
id: "0016"
title: "Self-update the desktop app via a read-only release check plus the existing installer"
status: active
date: 2026-08-26
---

## Context

The desktop app installs from prebuilt GitHub Releases artifacts via `scripts/install.sh` (ADR
0015). After install, the only way to get a newer version is to re-run the installer, which the user
is not told to do and requires re-running a shell command. The desktop bundle version is also stuck
at `0.1.0` while release tags are `v0.3.1`, so any automatic comparison against the latest tag would
always claim an update exists on the latest build.

The standard Tauri answer (the updater plugin) is a poor fit for the current packaging: it requires
signed update artifacts, Linux updater artifacts center on AppImage (deliberately skipped in the
release workflow), and macOS auto-update needs code signing and notarization (the bundle is
currently unsigned).

## Decision

**Update the desktop app through a read-only in-app release check plus a single action button that
runs the existing `scripts/install.sh` with appropriate elevation and then relaunches the app. Do
not adopt the Tauri updater plugin and do not reimplement download/install logic in Rust.**

- On desktop launch, the Rust shell fetches `releases/latest` from the GitHub API, compares the tag
  to the running app's version, and returns the newer `{ version, title }` (display only) when one
  exists.
- The webview shows a banner with an `Update now` button when an update is available; no manual
  "check for updates" step.
- `Update now` runs the canonical installer via a single hardcoded, elevated command (`pkexec` on
  Linux, `osascript ... with administrator privileges` on macOS). The app does not download the
  bundle or reimplement install logic.
- The webview NEVER supplies URLs to Rust; `apply_update()` takes no arguments, so a webview XSS
  cannot cause the app to install an arbitrary package.
- The desktop bundle version is derived from the release tag at build time so `getVersion()` and the
  package metadata match the tag.

## Options considered

1. **Tauri updater plugin** - idiomatic and most seamless. Rejected for now: needs signed update
   artifacts, AppImage (and/or newer Deb support) on Linux, and macOS signing/notarization, all of
   which conflict with the deliberate no-AppImage/no-signing choices in ADR 0015. Revisit if
   signing/notarization and AppImage are accepted later.
2. **In-app check + run the existing installer (chosen)** - reuses the tested `install.sh`, keeps
   `.deb`/`.dmg` artifacts and the curl-install path unchanged, no signing required. Needs an OS
   auth prompt (pkexec / administrator privileges) because the app is not privileged.
3. **In-app check + in-app download/install in Rust** - rejected: the webview would need to pass
   URLs (credible XSS-to-root vector) and Rust would reimplement fragile mount/copy/dpkg/checksum
   logic that `install.sh` already owns.
4. **Manual re-run of install.sh (status quo)** - no code, but no discoverability and no in-app
   surface; option 2 adds discoverability while keeping the mechanism.

## Consequences

- Users get a visible update prompt with one click, without a manual shell command.
- The app still cannot silently self-replace; install requires an OS auth prompt on Linux/macOS.
- Trust is carried by the GitHub release over HTTPS; the published SHA256 checksum protects against
  corrupt/truncated downloads, NOT against a tampered release. True authenticity requires code
  signing, which the project has not adopted.
- `install.sh` is hardened to fail closed when a checksum is missing, rather than warn-and-skip.
- Windows auto-update stays manual (`.msi`).
- Adds `reqwest` (rustls) + `serde_json` to the desktop Rust dependency graph; no new logic for
  download/verification beyond what `install.sh` already does.

## Advice

Research (Tauri updater docs + Apple signing/notarization docs) confirmed the updater plugin's Linux
story is centered on AppImage and that macOS distribution expects signing/notarization; given the
unsigned `.dmg` and `.deb`-only Linux targets, the updater plugin is not a clean fit yet. Separate
research (Apple TN2206 / code-signing) confirmed that stripping `com.apple.quarantine` or ad-hoc
signing are workarounds, not proper distribution fixes, and that curl/reqwest downloads do not set
the quarantine attribute - so the existing unsigned install path is preserved by delegating to
`install.sh`.
