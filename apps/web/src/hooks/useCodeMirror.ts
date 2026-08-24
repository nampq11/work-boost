import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { shouldReplaceExternally } from '../lib/source-editor-sync.ts';

// Tags transactions that originate from prop-driven value sync, so the update
// listener can distinguish them from user edits and avoid a feedback loop.
const externalSyncAnnotation = Annotation.define<boolean>();
// Markdown highlighting tuned to the Work Boost palette. Marks (###, -, **)
// are dimmed so content reads first, inline code takes an accent color, and
// headings scale like a desktop code editor.
const workBoostHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.5em', color: 'var(--text-primary)' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.3em', color: 'var(--text-primary)' },
  { tag: tags.heading3, fontWeight: '700', fontSize: '1.15em', color: 'var(--text-primary)' },
  {
    tag: [tags.heading4, tags.heading5, tags.heading6],
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  { tag: tags.monospace, color: 'var(--accent-orange)' },
  { tag: tags.labelName, color: 'var(--text-muted)' },
  { tag: tags.link, color: 'var(--accent-blue)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent-blue)' },
  { tag: tags.strong, fontWeight: '700', color: 'var(--text-primary)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },
  { tag: tags.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: tags.contentSeparator, color: 'var(--accent-blue)', fontWeight: '700' },
  { tag: [tags.character, tags.escape], color: 'var(--accent-orange)' },
  // Marks must come after heading/strong rules: lezer-markdown tags them via
  // parent prefixes (ATXHeading3/..., StrongEmphasis/...), so this rule has to
  // win the CSS cascade to keep punctuation small, unbolded, and dimmed.
  {
    tag: tags.processingInstruction,
    color: 'var(--text-muted)',
    fontWeight: '400',
    fontSize: '1em',
  },
]);

const workBoostTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text-primary)',
      backgroundColor: 'var(--surface-sidebar)',
      fontSize: '0.875rem',
    },
    '.cm-scroller': {
      fontFamily: '"IBM Plex Mono", monospace',
      lineHeight: '1.625',
    },
    '.cm-content': {
      caretColor: 'var(--accent-blue)',
      padding: '20px 0',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--surface-card)',
      color: 'var(--text-muted)',
      border: 'none',
      borderRight: '1px solid var(--border)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent-blue)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--accent-blue) 25%, transparent)',
    },
  },
  { dark: false },
);

const baseExtensions: Extension[] = [
  lineNumbers(),
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  markdown({ completeHTMLTags: false, pasteURLAsLink: false }),
  syntaxHighlighting(workBoostHighlight, { fallback: true }),
  EditorView.lineWrapping,
  workBoostTheme,
];

interface UseCodeMirrorOptions {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

// Scoped to content attributes only so a locale change can update the
// aria-label without tearing down the view (and its undo history).
const contentAttributesCompartment = new Compartment();

function contentAttributesExtension(ariaLabel: string): Extension {
  return EditorView.contentAttributes.of({
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'off',
    'aria-label': ariaLabel,
  });
}

export function useCodeMirror({ value, onChange, ariaLabel }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Last prop value seen; lets us tell an echo of a local edit apart from a
  // document replacement arriving through the store.
  const previousValueRef = useRef(value);
  const createStateRef = useRef<((doc: string) => EditorState) | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const extensions: Extension[] = [
      ...baseExtensions,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (update.transactions.some((tr) => tr.annotation(externalSyncAnnotation))) return;
        onChangeRef.current(update.state.doc.toString());
      }),
      contentAttributesCompartment.of(contentAttributesExtension(ariaLabel)),
    ];
    const createState = (doc: string) => EditorState.create({ doc, extensions });

    const view = new EditorView({ parent: container, state: createState(value) });
    createStateRef.current = createState;
    viewRef.current = view;

    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // Mount/unmount only; value flows through the sync effect below.
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (!shouldReplaceExternally(currentDoc, value)) {
      previousValueRef.current = value;
      return;
    }
    // Never interrupt an active IME composition; once composition ends, the
    // resulting edit echoes back as a local change or re-triggers this effect.
    if (view.composing) return;

    if (value !== previousValueRef.current) {
      // Prop moved beyond our own echo: treat it as a different document.
      // Replacing the whole state drops undo history and resets the cursor,
      // so Cmd+Z after a file switch cannot resurrect the previous file.
      const nextState = createStateRef.current?.(value);
      if (!nextState) return;
      view.setState(nextState);
    } else {
      // Same-document correction (e.g. store reset): annotated dispatch keeps
      // history and maps the cursor through the change.
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
        annotations: externalSyncAnnotation.of(true),
      });
    }
    previousValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: contentAttributesCompartment.reconfigure(contentAttributesExtension(ariaLabel)),
    });
  }, [ariaLabel]);

  return containerRef;
}
