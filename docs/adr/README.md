# Architecture Decision Records

This folder contains Architecture Decision Records (ADRs) for the WorkBoost.

## Format

Each ADR is markdown note with YAML frontmatter. Template:

```markdown
---
type: ADR
id: "0001"
title: "Short decision title"
status: proposed # proposed, active, superseded, retired
date: YYYY-MM-DD
superseded_by: "0007" # only if status: superseded
---

## Context
what situation led to this decision? what forces and constraints are at play?

## Decision
**What was decided.** State it clearly in one or two sentences - bold so it stands out.

## Options considered
- **Option A** (chosen): brief description - pros / cons
- **Option B**: brief description - pros / cons
- **Option C**: brief description - pros / cons

## Consequences
What becomes easier or harder as a result?
What are the positive and negative ramifications?
What would trigger re-evaluation of this decision?

## Advice
*(optional)* Input received before making this decision - who was consulted, what they said, when.
Omit if the decision was made unilaterally with not external input.
```

### Status lifecycle

```text
proposed → active → superseded
                 ↘ retired      (decision no longer relevant, not replaced)
```

## Rules

- One decision per file
- Files named `NNNN-short-title.md` (monotonic numbering)
- Once `active`, never edit - supersede instead
- When superseded: update `status: superseded` and `superseded_by: "NNNN"`
- ARCHITECTURE.md reflects the current state (active decisions only)

## Index

| ID | Title | Status |
|----|-------|--------|
| [0001](0001-assistant-ui-integration.md) | Integrate assistant-ui at the frontend boundary | active |
| [0002](0002-workspace-api-and-concurrency.md) | Define explicit browser workspace contracts | active |
| [0003](0003-sandbox-workspace-html-apps.md) | Sandbox workspace HTML apps | active |
| [0004](0004-vite-web-shell-stack.md) | Use the existing Vite web shell stack | active |
| [0005](0005-development-sse-cancellation.md) | Treat expected development SSE disconnects as cancellation | active |
| [0006](0006-configurable-ai-provider.md) | Preserve the legacy AI provider default | superseded by [0022](0022-default-ai-provider-openai-codex.md) |
| [0007](0007-browser-oauth-boundary.md) | Keep browser OAuth behind the API | active |
| [0008](0008-desktop-tauri-sidecar-shell.md) | Run the Deno API as a Tauri 2 sidecar in the desktop shell | active |
| [0009](0009-controlled-value-sync-between-store-and-codemirror.md) | Control store<->CodeMirror value sync via transaction annotations | active |
| [0010](0010-source-editor-viewport-wrapping-and-sizing.md) | Source editor viewport: soft wrapping, height, and resizing | active |
| [0011](0011-codemirror-theme-via-css-variables.md) | CodeMirror theme built from CSS variables | active |
| [0012](0012-source-editor-v1-scope-search-and-markdown-extras.md) | Source editor v1 scope: no search, no markdown extras | active |
| [0013](0013-editor-fills-viewport-height.md) | Editor fills viewport height with slim document toolbar | active |
| [0014](0014-extension-public-surface.md) | Narrow the extensions public surface to contract plus factories | active |
| [0015](0015-distribute-desktop-via-github-releases.md) | Distribute desktop installers as prebuilt GitHub Releases artifacts | active |
| [0016](0016-desktop-app-self-update.md) | Update the desktop app via in-app release check and native install | active |
| [0017](0017-release-workflow-manual-trigger.md) | Make the desktop release build manually re-triggerable | active |
| [0018](0018-data-port-dual-access.md) | DataPort abstraction for dual-port data access | active |
| [0019](0019-proxy-sidecar-http-through-rust.md) | Proxy bundled sidecar HTTP through the Rust shell | active |
| [0020](0020-desktop-update-progress.md) | Stream in-app update progress out-of-band via a scratch progress file | active |
| [0021](0021-split-platform-capability-from-subscription.md) | Split platform capability from delivery subscription | active |
| [0022](0022-default-ai-provider-openai-codex.md) | Default unconfigured workspaces to the OpenAI Codex provider | active |
