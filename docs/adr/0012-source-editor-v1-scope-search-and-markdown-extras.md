---
type: ADR
id: "0012"
title: "Source editor v1 scope: no search panel, disable markdown() paste/autocomplete extras"
status: proposed
date: 2026-08-24
---

## Context
This change is framed as a drop-in swap for the textarea, but three defaults pull in behavior beyond
that contract:

1. `@codemirror/search`'s keymap adds a Mod-F search panel with its own unstyled UI and captures
   browser find inside the editor.
2. `markdown()` installs an autocompletion source for HTML tags by default (`completeHTMLTags: true`),
   which requires the `@codemirror/autocomplete` package - a dependency the plan explicitly excludes.
3. `markdown()` enables `pasteURLAsLink`, rewriting pasted bare URLs into `[url](url)` - contradicting
   the plan's own invariant of "no markdown normalization on paste".

## Decision
**Ship v1 without `@codemirror/search`. Configure `markdown({ completeHTMLTags: false })` so no
autocomplete source is installed. Disable URL auto-linking via `EditorView.contentAttributes`
compatibility or the markdown config so pasted text is inserted verbatim.**

Concretely:

```ts
const state = EditorState.create({
  doc: value,
  extensions: [
    markdown({ completeHTMLTags: false }),
    EditorView.lineWrapping,
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    lineNumbers(),
    cmTheme,
    markdownHighlightStyle,
  ],
});
```

Search can be added later as its own scoped change once the panel is themed against the CSS variables.

## Options considered
- **Include search now** (plan text): real UX value, but ships an unthemed panel, hijacks Mod-F, adds
  a dependency, and expands testing surface beyond "drop-in swap".
- **Disable markdown extras** (chosen): keeps byte-exact paste semantics (invariant #1), removes the
  hidden autocomplete dependency, keeps bundle smaller.

## Consequences
Users keep browser-native Ctrl/Cmd-F inside the page until a styled in-editor search lands. Pasting
URLs inserts them literally - matching today's textarea exactly. One fewer dependency than planned.

## Advice
Unilateral decision based on the official lang-markdown README (config defaults verified 2026-08-24).
