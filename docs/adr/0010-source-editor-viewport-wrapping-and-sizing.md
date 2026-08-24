---
type: ADR
id: "0010"
title: "Source editor viewport: soft wrapping, height, and resizing"
status: proposed
date: 2026-08-24
---

## Context
The textarea being replaced soft-wraps (`white-space: pre-wrap` default), grows to `min-h-[500px]`,
and can be drag-resized by the user (`resize-y`). CodeMirror 6 does none of this by default: without
`EditorView.lineWrapping` long lines scroll horizontally, and `.cm-editor` has no intrinsic height, so
the editor collapses or overflows depending on surrounding CSS. The plan specifies neither wrapping
nor sizing.

## Decision
**Enable `EditorView.lineWrapping`, render the editor inside a container with the existing
`min-h-[500px] rounded-lg border` styling, let `.cm-editor`/`.cm-scroller` fill that container with
`height: 100%` plus internal scrolling, and drop user drag-resize.**

```css
.source-editor { min-height: 500px; }
.cm-editor { height: 100%; }
.cm-scroller { overflow: auto; }
```

Rationale for dropping drag-resize: CodeMirror's value is a fixed, internally-scrolling code surface;
a resizable shell adds CSS complexity (no native resize handle on a div) for little benefit once
content scrolls internally. If users ask for it later, a fixed set of size presets is cheaper than a
drag handle.

## Options considered
- **lineWrapping + fixed-height scrolling region** (chosen): matches textarea reading behavior,
  standard CM setup.
- **No lineWrapping**: horizontal scroll - regression vs today; rejected.
- **Auto-grow to content**: needs re-measure effects per change; fights autosave-triggered rerenders;
  rejected for v1.

## Consequences
Long lines wrap like they do today. The editor occupies at least 500px and scrolls internally beyond
the page fold. Users lose corner-drag resizing - acceptable trade, revisit only on feedback.

## Advice
Unilateral decision.
