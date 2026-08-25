---
type: ADR
id: "0013"
title: "Editor fills the viewport height with a slim document toolbar"
status: active
date: 2026-08-25
---

## Context
The document editor renders as a centered, bordered "card" inside a `max-w-4xl mx-auto px-10 py-10`
column, under a large centered `<h1>` that duplicates the file title already shown in the `AppHeader`
breadcrumb. The page (`main-viewport`) and the editor both scroll. The result reads as a one-page
document preview rather than an editing surface: dead whitespace around the card, vertical space
consumed by the oversized title, and the document identity shown twice. ADR 0010 settled CodeMirror's
internal wrapping/sizing (line wrapping, drop drag-resize, a fixed-height scroll region), but the
implementation drifted to a `min-h-[500px] max-h-[75vh]` grow-to-cap via Tailwind and never applied
`.cm-editor { height: 100% }`.

## Decision
**Both the CodeMirror source mode and the Tiptap WYSIWYG mode fill the remaining viewport height below
the header and scroll internally. The duplicated large title is replaced by a slim `h-11` document
toolbar laid out like GitHub's file view: view-mode tabs (Preview | Source) on the left, truncated file
title next to them, Save on the right. Source mode renders full-bleed with the gutter hugging the left
edge (Zed-like); Preview (WYSIWYG) mode renders its content in a centered readable column
(`max-w-3xl`), matching GitHub's Preview-over-Code pattern.**

This brings the sizing model onto ADR 0010's fixed-height internal-scroll intent at the layout level
(`.cm-editor { height: 100% }`, `.cm-scroller { overflow: auto }`) and removes the vertical
auto-grow/cap drift.

## Options considered
- **Full-width full-height editor for both modes (Option A)**: one width for both modes so the
  source/WYSIWYG toggle does not reflow the pane, and the line-number gutter hugs the left edge.
  Initially chosen; the centered-column tradeoff was deferred.
- **Split widths per mode (Option B, chosen)**: source stays full-bleed (Zed-like, gutter at the left
  edge); Preview renders a centered `max-w-3xl` column. GitHub's file view validates this exact
  pattern (Code full-width, Preview centered), so the pane-width change on toggle is a familiar,
  acceptable reflow. A toggle button was also replaced by GitHub-style Preview | Source tabs: tabs
  communicate "two views of the same document" better than an action-looking button.
- **Keep floating card + oversized title** (rejected): dead whitespace, duplicated document identity,
  page-level scroll - the problem this ADR removes.

## Consequences
- The editor feels like an editing surface: more usable height, no dead whitespace, no duplicated title.
- Reconciles the sizing model with ADR 0010's fixed-height internal scroll.
- Layout scroll moves into each editor; `main-viewport` keeps `overflow-y: auto` so the no-document
  `TodayPanel` continues to page-scroll.
- Long-form prose readability is preserved in Preview mode via the centered column; source mode keeps
  the code-editor feel. The pane width changes on toggle between modes (accepted, GitHub-like).
- The mode switcher is a segmented tab control, not a toggle button; it is the primary affordance at
  the left of the document toolbar.
- Cross-references ADR 0010 (internal wrapping/sizing) and ADR 0011 (theme via CSS variables); no
  conflict, 0013 covers surrounding layout and chrome.

## Advice
Inherited from design reviews comparing the Work Boost editor to Zed and GitHub: borrow Zed's
content-first full-viewport editor and slim chrome (but not its dense multi-file explorer), and
GitHub's file-view toolbar (mode tabs left, actions right) and Preview-over-Code width split.
