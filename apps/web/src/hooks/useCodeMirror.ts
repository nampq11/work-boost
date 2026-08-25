import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  HighlightStyle,
  StreamLanguage,
  foldGutter,
  foldKeymap,
  foldService,
  syntaxHighlighting,
} from '@codemirror/language';
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
// Zed-inspired highlight: structural tokens (frontmatter braces, fences, keys)
// stay muted so content reads first; values and text render bright; code blocks
// take the accent color. Uses design tokens so it adapts to light/dark.
const zedHighlight = HighlightStyle.define([
  { tag: tags.meta, color: 'var(--text-muted)' },
  { tag: tags.propertyName, color: 'var(--text-muted)' },
  { tag: tags.string, color: 'var(--text-primary)' },
  { tag: tags.number, color: 'var(--text-primary)' },
  { tag: tags.monospace, color: 'var(--accent-orange)' },
  { tag: tags.heading, color: 'var(--text-primary)', fontWeight: '700' },
  { tag: tags.strong, color: 'var(--text-primary)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--text-primary)', fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--accent-blue)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent-blue)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
]);

interface SourceState {
  first: boolean;
  frontmatter: boolean;
  fence: '```' | '~~~' | null;
}

// Hand-rolled line-based tokenizer. lezer-markdown has no YAML-frontmatter
// concept and mis-tokenizes a frontmatter block as a setext heading (bold,
// oversized). A single stream language lets us shade the frontmatter as muted
// keys + bright values and the body as markdown, in one consistent mono style.
const sourceLanguage = StreamLanguage.define<SourceState>({
  name: 'workboost-markdown',
  startState: () => ({ first: true, frontmatter: false, fence: null }),
  token(stream, state) {
    const atLineStart = stream.pos === 0;
    if (stream.eatSpace()) return null;
    const line = stream.string;
    const trimmed = line.trim();

    // Frontmatter opens only on the document's first line and must be `---`.
    if (state.first) {
      state.first = false;
      if (atLineStart && /^---+$/.test(trimmed)) {
        state.frontmatter = true;
        stream.skipToEnd();
        return 'meta';
      }
    }

    if (state.frontmatter) {
      // Closing `---`
      if (atLineStart && /^---+$/.test(trimmed)) {
        state.frontmatter = false;
        stream.skipToEnd();
        return 'meta';
      }
      // `key: value` — shade the key as a muted property and the rest as value.
      if (atLineStart) {
        const key = /^([^:\n]+?):/.exec(line);
        if (key && !key[1].trim().startsWith('#')) {
          stream.pos += key[1].length;
          return 'propertyName';
        }
      }
      stream.skipToEnd();
      return 'string';
    }

    // Fenced code block
    if (state.fence) {
      if (atLineStart && trimmed.startsWith(state.fence)) {
        state.fence = null;
        stream.skipToEnd();
        return 'meta';
      }
      stream.skipToEnd();
      return 'monospace';
    }
    const fence = /^(```+|~~~+)\s*$/.exec(line);
    if (atLineStart && fence) {
      state.fence = fence[1].startsWith('`') ? '```' : '~~~';
      stream.skipToEnd();
      return 'meta';
    }

    // ATX heading
    if (atLineStart && /^\s{0,3}#{1,6}\s/.test(line)) {
      stream.skipToEnd();
      return 'heading';
    }

    // Inline code / bold / emphasis
    if (stream.match(/`[^`\n]+`/)) return 'monospace';
    if (stream.match(/\*\*[^*\n]+\*\*/)) return 'strong';
    if (stream.match(/__[^_\n]+__/)) return 'strong';
    if (stream.match(/\*[^*\n]+\*/)) return 'emphasis';
    if (stream.match(/_([^_\n]+)_/)) return 'emphasis';

    stream.skipToEnd();
    return null;
  },
});

// Folding support for the stream language: lezer-markdown provides folding via
// its syntax tree, which a StreamLanguage does not. We compute fold ranges for
// the frontmatter block, ATX headings, and fenced code blocks so the fold
// gutter has ranges to show arrows for.
const markdownFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const trimmed = line.text.trim();

  // End the fold at the close of the line just before the boundary line, not at
  // the boundary line's start. Using `next.from` includes the newline separator,
  // so CodeMirror pulls the boundary line (next heading, closing frontmatter
  // fence, closing code fence) up onto the fold line and merges it with the
  // placeholder. Mirrors @codemirror/lang-markdown: it ends the range at the
  // section's last content node and returns null for empty sections.
  const foldTo = (boundaryLine: number): { from: number; to: number } | null => {
    if (boundaryLine - 1 <= line.number) return null;
    const to = state.doc.line(boundaryLine - 1).to;
    return to > line.to ? { from: line.to, to } : null;
  };

  // Frontmatter block (opens on the document's first `---`).
  if (line.number === 1 && /^---+$/.test(trimmed)) {
    for (let n = line.number + 1; n <= state.doc.lines; n++) {
      if (/^---+$/.test(state.doc.line(n).text.trim())) return foldTo(n);
    }
    return null;
  }

  // ATX heading: fold until the next heading. The last heading has nothing
  // below it to fold, so it gets no arrow.
  if (/^\s{0,3}#{1,6}\s/.test(line.text)) {
    for (let n = line.number + 1; n <= state.doc.lines; n++) {
      if (/^\s{0,3}#{1,6}\s/.test(state.doc.line(n).text)) return foldTo(n);
    }
    return null;
  }

  // Fenced code block: only the opening fence is foldable (must have a closing
  // fence); the closing fence and unclosed fences get no arrow.
  const fence = /^(```+|~~~+)\s*$/.exec(line.text);
  if (fence) {
    const mark = fence[1];
    for (let n = line.number + 1; n <= state.doc.lines; n++) {
      if (state.doc.line(n).text.trim().startsWith(mark)) return foldTo(n);
    }
    return null;
  }

  return null;
});

// Fold-gutter glyphs. CodeMirror's defaults ("⌄"/"›" text arrows) render as
// small, cramped characters; an SVG chevron stays crisp at any size and gives
// us a hover affordance via CSS. open=true means the line can still be folded
// (expanded, chevron-down); open=false means the block is folded (chevron-right).
function createFoldMarker(open: boolean): HTMLElement {
  const el = document.createElement('span');
  el.className = 'cm-fold-marker';
  // markerDOM bypasses the default span, which would otherwise set the title.
  el.title = open ? 'Fold line' : 'Unfold line';
  const path = open ? 'M2.5 4.25 6 7.75l3.5-3.5' : 'M4.25 2.5 7.75 6l-3.5 3.5';
  el.innerHTML =
    '<svg class="cm-fold-chevron" viewBox="0 0 12 12" aria-hidden="true">' +
    `<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    '</svg>';
  return el;
}
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
      width: '22px',
      padding: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    '.cm-foldGutter .cm-fold-marker': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      width: '16px',
      height: '16px',
      borderRadius: '4px',
      color: 'var(--text-muted)',
      cursor: 'pointer',
      // Hidden until the line's gutter is hovered: keeps the gutter clean and
      // reveals the fold arrow only where the user is looking. The folded
      // state stays discoverable via the inline "..." placeholder.
      opacity: '0',
      transition: 'opacity 120ms ease, color 120ms ease, background-color 120ms ease',
    },
    '.cm-foldGutter .cm-gutterElement:hover .cm-fold-marker, .cm-foldGutter .cm-fold-marker:hover, .cm-foldGutter .cm-fold-marker:focus-visible':
      {
        opacity: '1',
      },
    '.cm-foldGutter .cm-fold-marker:hover': {
      color: 'var(--text-primary)',
      backgroundColor: 'color-mix(in srgb, var(--text-muted) 16%, transparent)',
    },
    '.cm-foldGutter .cm-fold-chevron': {
      width: '12px',
      height: '12px',
      display: 'block',
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
  foldGutter({ markerDOM: createFoldMarker }),
  keymap.of(foldKeymap),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  sourceLanguage,
  markdownFold,
  syntaxHighlighting(zedHighlight, { fallback: true }),
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
