import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { shouldApplyDeferredExternal, shouldReplaceExternally } from '../lib/source-editor-sync.ts';

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
      height: '100%',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--surface-app)',
      fontSize: '0.875rem',
    },
    '.cm-scroller': {
      fontFamily: '"IBM Plex Mono", monospace',
      lineHeight: '1.625',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: 'var(--accent-blue)',
      // Bottom padding keeps the caret visible above the pane edge on the last line
      padding: '20px 0 120px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--surface-app)',
      color: 'var(--text-muted)',
      border: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      textAlign: 'right',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--accent-blue) 6%, transparent)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)',
      color: 'var(--text-primary)',
    },
    '.cm-foldGutter': {
      color: 'var(--text-muted)',
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 2px',
    },
    '.cm-foldGutter span': {
      cursor: 'pointer',
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
  foldGutter(),
  keymap.of(foldKeymap),
  highlightActiveLine(),
  highlightActiveLineGutter(),
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
  // External value received while the user is composing IME input. The sync
  // effect defers it (never clobbers an in-progress composition), and the
  // compositionend listener in the mount effect reconciles it once the
  // composition completes (see that listener for the apply rule).
  const deferredValueRef = useRef<string | null>(null);
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

    // Reconcile a deferred external value once composition ends. The sync
    // effect below skips external sets while view.composing is true, so an
    // external value that lands mid-composition is held in deferredValueRef.
    // It is applied only if the user committed no text during that
    // composition (e.g. they cancelled their IME input). If they did commit
    // text, that edit already echoes into the store via onChange, so the
    // user's text wins and the deferred value is discarded.
    let compositionStartDoc: string | null = null;
    const onCompositionStart = () => {
      compositionStartDoc = view.state.doc.toString();
    };
    const onCompositionEnd = () => {
      const deferred = deferredValueRef.current;
      deferredValueRef.current = null;
      const currentDoc = view.state.doc.toString();
      if (!shouldApplyDeferredExternal(currentDoc, deferred, compositionStartDoc)) {
        compositionStartDoc = null;
        return;
      }
      compositionStartDoc = null;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: deferred },
        annotations: externalSyncAnnotation.of(true),
      });
      previousValueRef.current = deferred;
    };
    view.dom.addEventListener('compositionstart', onCompositionStart);
    view.dom.addEventListener('compositionend', onCompositionEnd);

    return () => {
      view.dom.removeEventListener('compositionstart', onCompositionStart);
      view.dom.removeEventListener('compositionend', onCompositionEnd);
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
    // Never interrupt an active IME composition. Hold the external value and
    // let the compositionend listener reconcile it once composition completes
    // (applying it only if the user committed no text).
    if (view.composing) {
      deferredValueRef.current = value;
      return;
    }

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
