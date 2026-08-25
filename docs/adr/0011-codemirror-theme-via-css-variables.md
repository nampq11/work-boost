---
type: ADR
id: "0011"
title: "CodeMirror theme built from CSS variables, no JS re-reading"
status: active
date: 2026-08-24
---

## Context
The plan proposes two contradictory theming approaches: "re-read [CSS variables] on
`document.documentElement` changes" or "use a CSS-variable-driven theme". The app toggles light/dark by
setting `data-theme` on `<html>` (`ui-store.ts`), and `tokens.css` re-declares the variables per
theme. CSS custom properties resolve at paint time against the current cascade - any style that
references `var(--x)` updates automatically when the attribute flips.

## Decision
**Build the CodeMirror theme exclusively with `var(--...)` references inside an
`EditorView.theme(...)` / `SyntaxHighlighter` style values; never read computed styles in JS and never
rebuild the editor on theme change.**

```ts
const cmTheme = EditorView.theme({
  "&": { backgroundColor: "var(--surface-sidebar)", color: "var(--text-primary)" },
  ".cm-gutters": { backgroundColor: "var(--surface-sidebar)", color: "var(--text-muted)",
                   border: "none", borderRight: "1px solid var(--border)" },
  "&.cm-focused": { outline: "2px solid var(--accent-blue)", outlineOffset: "-1px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent-blue) 8%, transparent)" },
  ".cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--accent-blue) 25%, transparent) !important" },
});
```

Highlighting colors: map CodeMirror tags (headings, emphasis, code, links) to existing text/accent
variables via `HighlightStyle`; do not add new palette variables in this change.

## Options considered
- **JS re-read + rebuild on toggle** (plan alternative): MutationObserver on `data-theme`, recompute,
  reconfigure compartments. Extra state, extra failure modes, zero benefit.
- **CSS-variable-only theme** (chosen): theme follows the app automatically; no lifecycle coupling.

## Consequences
Light/dark switching needs no editor code at all; manual verification step 6 becomes a pure visual
check. One caveat: `!important` is required on selection background because CM's default theme sets
its own `.cm-selectionBackground`.

## Advice
Unilateral decision.
