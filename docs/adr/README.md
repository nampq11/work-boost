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

```
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
