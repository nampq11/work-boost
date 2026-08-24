---
type: ADR
id: "0009"
title: "Controlled value sync between the Zustand store and CodeMirror"
status: proposed
date: 2026-08-24
---

## Context
`SourceEditor` must stay a controlled component (`value` / `onChange` over `draft` and `updateBody`)
because autosave, dirty state, and file switching all hang off the store. The plan proposes "track the
last externally-set value and suppress `onChange` when the dispatched change matches it", which is a
string-matching guard. That is fragile: rapid typing plus store round-trips can produce stale external
dispatches that clobber the cursor, and equality-based suppression does not distinguish transaction
origins. There are three sync scenarios to define: user keystrokes, external replacement (file switch,
cached-draft restore), and remote workspace events rewriting the active document.

## Decision
**Sync with an annotation-tagged one-way flow: only dispatch a full-document replacement when the new
`value` differs from `view.state.doc.toString()`, tag that dispatch with an `isExternal` annotation,
and have the update listener ignore any transaction carrying that annotation. Clear undo history on
external document replacement.**

```tsx
const ExternalAnnotation = Annotation.define<boolean>();

// effect on [value]: only replace when actually different
if (view.state.doc.toString() !== value) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    annotations: ExternalAnnotation.of(true),
    // history cleared via isolateHistory or reconfiguring history()
  });
}

// updateListener: emit only genuine user edits
if (update.docChanged && !update.transactions.some(tr =>
      tr.annotation(ExternalAnnotation))) {
  onChange(update.state.doc.toString());
}
```

Rules:
- Never compare against a remembered "last external value"; compare doc content at dispatch time.
- On external replacement (different document), reset cursor to a sensible position (start) and clear
  undo history so Cmd+Z cannot span two files.
- If `value` equals the current doc, do nothing - no dispatch, no cursor movement.
- Remote events that rewrite the active body use the same external path; cursor restoration across a
  changed document is best-effort and not guaranteed.

## Options considered
- **String-match suppression** (plan text): remembers last externally-set string; races under fast
  typing, ambiguous when user edits coincidentally equal the external value.
- **Two-way binding / editor owns state**: rejected - breaks single-source-of-truth draft/store model.
- **Annotation-tagged external dispatch** (chosen): origin is explicit per transaction; standard CM6
  controlled-component pattern.

## Consequences
The hook has no hidden mutable mirrors of the store value. Cursor jumps on file switches are explicit
behavior instead of accidents. Undo history never leaks across documents. IME composition is safe
because external sets are skipped while composing (`view.composing`) rather than suppressed after the
fact.

## Advice
Unilateral decision based on the CodeMirror 6 controlled-component pattern documented in the CM6
system guide and community examples.
