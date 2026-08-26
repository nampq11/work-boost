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
| [0006](0006-configurable-ai-provider.md) | Preserve the legacy AI provider default | active |
| [0007](0007-browser-oauth-boundary.md) | Keep browser OAuth behind the API | active |
| [0008](0008-desktop-tauri-sidecar-shell.md) | Run the Deno API as a Tauri 2 sidecar in the desktop shell | active |
| [0009](0009-controlled-value-sync-between-store-and-codemirror.md) | Control store<->CodeMirror value sync via transaction annotations | active |
| [0010](0010-source-editor-viewport-wrapping-and-sizing.md) | Source editor viewport: soft wrapping, height, and resizing | active |
| [0011](0011-codemirror-theme-via-css-variables.md) | CodeMirror theme built from CSS variables | active |
| [0012](0012-source-editor-v1-scope-search-and-markdown-extras.md) | Source editor v1 scope: no search, no markdown extras | active |
| [0013](0013-editor-fills-viewport-height.md) | Editor fills viewport height with slim document toolbar | active |
| [0014](0014-extension-public-surface.md) | Narrow the extensions public surface to contract plus factories | active |
