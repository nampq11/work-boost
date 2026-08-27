import { useAui, useAuiState } from '@assistant-ui/react';
import { Coins, Copy, FileText, PaperPlaneRight } from '@phosphor-icons/react';
import type { Editor } from '@tiptap/react';
import { Button } from '@work-boost/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDataPort } from '../../contexts/DataPortContext.tsx';
import { useAutosave } from '../../hooks/useAutosave.ts';
import { useSidecarStatus } from '../../hooks/useSidecarStatus.ts';
import { DataPortUnavailableError } from '../../lib/data-port.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { parseFrontmatter, stringifyMarkdown } from '../../lib/markdown-parser.ts';
import { lastSavedDailyPathFromThread } from '../../lib/tool-result.ts';
import type { DebtDocument, TodayDailyDocument } from '../../lib/types.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore, useWorkspaceStoreApi } from '../../store/workspace-store.ts';
import { FileMentionMenu } from '../ai/FileMentionMenu.tsx';
import { FrontmatterInspector } from './FrontmatterInspector.tsx';
import { EditorToolbar, TiptapEditor } from './TiptapEditor.tsx';

const SourceEditor = React.lazy(() =>
  import('./SourceEditor.tsx').then((m) => ({ default: m.SourceEditor })),
);

export function EditorContainer() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.activeDocument);
  const draft = useWorkspaceStore((state) => state.draft);
  const updateBody = useWorkspaceStore((state) => state.updateBody);
  const updateSource = useWorkspaceStore((state) => state.updateSource);
  const [sourceMode, setSourceMode] = useState(false);
  // Editor instance is owned by TiptapEditor; the header only hosts its toolbar
  const [editor, setEditor] = useState<Editor | null>(null);

  useAutosave();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        setSourceMode((mode) => !mode);
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, []);

  // Today view (front door): shown whenever no file is selected
  if (!document) {
    return <TodayPanel />;
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Document toolbar: view-mode toggle on the left (GitHub pattern); the
          save shortcut lives in the AppHeader breadcrumb and the status bar
          shows the save state */}
      <div className="flex h-11 shrink-0 items-center gap-4 border-b border-[var(--border)] px-6">
        <div
          role="group"
          aria-label={t('editor.viewMode')}
          className="flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-hover)] p-0.5"
        >
          <ViewTab selected={!sourceMode} onSelect={() => setSourceMode(false)}>
            {t('editor.previewTab')}
          </ViewTab>
          <ViewTab selected={sourceMode} onSelect={() => setSourceMode(true)}>
            {t('editor.sourceTab')}
          </ViewTab>
        </div>
        {/* Formatting toolbar shares the header row, right-aligned; only
            relevant in Preview mode */}
        {!sourceMode && editor && <EditorToolbar editor={editor} />}
      </div>

      {/* Frontmatter Inspector: only preview mode. In source mode the raw
          frontmatter is part of the editable document, so the form is hidden.
          It sits in the same centered readable column as the editor body
          (max-w-3xl inside a px-8 scroll container, per ADR 0013) so the
          property form lines up with the document content below it. */}
      {!sourceMode && (
        <div className="mt-6 shrink-0 overflow-y-scroll px-8">
          <div className="mx-auto max-w-3xl">
            <FrontmatterInspector />
          </div>
        </div>
      )}

      {/* Editor Body: fills the remaining height and scrolls internally (ADR 0013) */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {sourceMode ? (
          <React.Suspense
            fallback={<div className="h-full bg-[var(--surface-app)]" aria-hidden="true" />}
          >
            {/* Source mode edits the whole file, frontmatter included, so it
                shows and turns back into the full markdown document. */}
            <SourceEditor
              value={stringifyMarkdown(document.frontmatter, draft)}
              onChange={updateSource}
            />
          </React.Suspense>
        ) : (
          <TiptapEditor value={draft} onChange={updateBody} onEditorReady={setEditor} />
        )}
      </div>
    </div>
  );
}

function ViewTab({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-[4px] px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-hover)] ${
        selected
          ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString()} ${currency}`;
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function TodayPanel() {
  const { t } = useI18n();
  const port = useDataPort();
  const sidecarStatus = useSidecarStatus();
  const storeApi = useWorkspaceStoreApi();
  const aui = useAui();
  const [captureText, setCaptureText] = useState('');
  const [daily, setDaily] = useState<TodayDailyDocument | null>(null);
  const [debts, setDebts] = useState<DebtDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sidecarUnavailable, setSidecarUnavailable] = useState(false);
  // Bumping this counter reruns the Today load effect (retry button).
  const [retryCount, setRetryCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Last daily report file the AI wrote, so Today can prove the day is
  // grounded in Markdown. Computed on mount and when a run finishes instead of
  // in a state selector, so streaming updates never rescan the whole thread.
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  // The capture box talks to the same thread as the Copilot workspace so both
  // surfaces share one conversation and one AI context.
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const wasRunningRef = useRef(false);

  useEffect(() => {
    setLastSavedPath(lastSavedDailyPathFromThread(aui.thread.getState().messages));
  }, [aui]);

  const refreshToday = useCallback(async () => {
    setSidecarUnavailable(false);
    const [todayDoc, pendingDebts] = await Promise.all([
      port.getDailyToday(),
      port.listDebts({ status: 'pending' }),
    ]);
    setDaily(todayDoc);
    setDebts(pendingDebts);
    // The panel data is already committed, so a sidebar refresh failure must
    // not surface as a Today load error; keep it best-effort.
    await storeApi
      .getState()
      .loadFiles()
      .catch(() => undefined);
  }, [port]);

  // Reload when the sidecar transitions to ready/browser so the summary and
  // debts appear without requiring a manual action after AI comes back.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    refreshToday()
      .catch((error) => {
        if (!active) return;
        if (error instanceof DataPortUnavailableError) {
          setSidecarUnavailable(true);
        } else {
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshToday, retryCount, sidecarStatus]);

  // Refresh summary and debts once a run on the shared thread finishes.
  useEffect(() => {
    const finished = wasRunningRef.current && !isRunning;
    wasRunningRef.current = isRunning;
    if (!finished) return;
    setLastSavedPath(lastSavedDailyPathFromThread(aui.thread.getState().messages));
    void refreshToday().catch((error) => {
      if (error instanceof DataPortUnavailableError) {
        setSidecarUnavailable(true);
      } else {
        setLoadFailed(true);
      }
    });
  }, [isRunning, refreshToday, aui]);

  // Once the sidecar becomes available, clear the unavailable flag so the panel
  // refetches on the next load.
  useEffect(() => {
    if (sidecarStatus === 'ready' || sidecarStatus === 'browser') {
      setSidecarUnavailable(false);
    }
  }, [sidecarStatus]);

  // Auto-grow the capture textarea as the user types.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [captureText]);

  function submitCapture(): void {
    const text = captureText.trim();
    if (!text || isRunning) return;
    setCaptureText('');
    // The conversation lives in the Copilot drawer thread, so surface it there.
    useUiStore.getState().openCopilot();
    aui.thread.append({
      role: 'user',
      content: [{ type: 'text', text }],
      startRun: true,
    });
  }

  function retryLoad(): void {
    setRetryCount((count) => count + 1);
  }
  async function copyReportMarkdown(): Promise<void> {
    const rawMarkdown = daily?.rawMarkdown;
    if (!rawMarkdown) return;
    // Copy the report body only; the YAML frontmatter is internal bookkeeping
    // (id, date, status, updatedAt, updatedBy) and would be noise in a paste.
    const markdown = parseFrontmatter(rawMarkdown).body;
    try {
      await navigator.clipboard.writeText(markdown);
      useUiStore.getState().showToast(t('editor.todayCopyMarkdownDone'));
    } catch {
      useUiStore.getState().showToast(t('editor.todayCopyMarkdownFailed'));
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitCapture();
    }
  }

  function captureHint(): string {
    if (isRunning) return t('editor.todayCaptureSending');
    if (lastSavedPath) return t('editor.todaySavedTo', { path: lastSavedPath });
    return t('editor.todayPromptHint');
  }

  const report = daily?.report ?? null;
  const sections = [
    {
      key: 'completed',
      title: t('editor.todayCompletedTitle'),
      tasks: report?.completed ?? [],
    },
    {
      key: 'incomplete',
      title: t('editor.todayIncompleteTitle'),
      tasks: report?.incomplete ?? [],
    },
    {
      key: 'planned',
      title: t('editor.todayPlannedTitle'),
      tasks: report?.planned ?? [],
    },
  ];
  // Empty sections add noise; only render the ones that have tasks.
  const visibleSections = sections.filter((section) => section.tasks.length > 0);
  // Whitespace-only custom sections must not count as content.
  const customSections = daily?.customSections.trim() ? daily.customSections : null;
  const hasReport = visibleSections.length > 0 || customSections !== null;
  const todayLabel = getTodayLabel();

  return (
    <div className="max-w-4xl mx-auto px-10 py-10 flex flex-col gap-6">
      {/* Capture box */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] m-0">
            {t('editor.todayTitle')}
          </h1>
          <span className="text-sm text-[var(--text-muted)]">{todayLabel}</span>
        </div>
        <div className="today-capture-anchor relative">
          <FileMentionMenu
            value={captureText}
            onApply={setCaptureText}
            containerClass=".today-capture-anchor"
          />
          <textarea
            ref={textareaRef}
            autoFocus
            value={captureText}
            onChange={(event) => setCaptureText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder={t('editor.todayPrompt')}
            disabled={isRunning}
            className="today-capture w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-[15px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] disabled:opacity-60"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--text-muted)] m-0">{captureHint()}</p>
          <Button
            variant="default"
            size="sm"
            onClick={submitCapture}
            disabled={!captureText.trim() || isRunning}
            className="gap-1.5 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:opacity-90"
          >
            <PaperPlaneRight size={14} />
            <span>{t('editor.todayCaptureAction')}</span>
          </Button>
        </div>
      </section>

      {/* Today data failed to load: keep whatever data we have and offer a retry */}
      {sidecarUnavailable && (
        <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] text-xs text-[var(--text-muted)] flex items-center justify-between">
          <span>
            <span className="font-medium text-[var(--text-primary)]">
              {t('copilot.sidecar.requiresSidecar')}
            </span>
            <span className="ml-2">{t('copilot.sidecar.requiresSidecarHint')}</span>
          </span>
          <button
            type="button"
            onClick={retryLoad}
            className="shrink-0 underline font-medium hover:opacity-80"
          >
            {t('editor.todayRetry')}
          </button>
        </div>
      )}
      {/* Today data failed to load: keep whatever data we have and offer a retry */}
      {!loading && loadFailed && (
        <div className="p-3 rounded-lg border border-[var(--accent-red)] bg-[#fee2e2] text-[#991b1b] text-xs flex items-center justify-between">
          <span>{t('editor.todayLoadFailed')}</span>
          <button
            type="button"
            onClick={retryLoad}
            className="underline font-medium hover:opacity-80"
          >
            {t('editor.todayRetry')}
          </button>
        </div>
      )}

      {/* Today's summary */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-tight text-[var(--text-primary)] m-0">
            <FileText size={15} className="text-[var(--accent-blue)]" />
            {t('editor.todaySummaryTitle')}
          </h2>
          {!loading && hasReport && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void copyReportMarkdown()}
              className="shrink-0"
            >
              <Copy size={12} />
              <span>{t('editor.todayCopyMarkdown')}</span>
            </Button>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)] m-0">…</p>
        ) : !hasReport ? (
          <p className="text-sm text-[var(--text-secondary)] m-0">
            {t('editor.todaySummaryEmpty')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {visibleSections.map((section) => (
              <div key={section.key} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-tight text-[var(--text-secondary)] m-0">
                  {section.title}
                </h3>
                <ul className="flex flex-col gap-1 m-0 list-none p-0">
                  {section.tasks.map((task, index) => (
                    <li
                      key={`${section.key}-${index}`}
                      className="flex gap-2 text-sm text-[var(--text-primary)]"
                    >
                      <span className="text-[var(--text-muted)]">•</span>
                      <span>
                        <span className="font-medium text-[var(--accent-blue)]">
                          {task.project || 'INBOX'}
                        </span>
                        {task.task ? `: ${task.task}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {customSections && (
              <div className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                {customSections}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Today's debts (browse-only) */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-tight text-[var(--text-primary)] m-0">
          <Coins size={15} className="text-[var(--accent-green)]" />
          {t('editor.todayDebtsTitle')}
        </h2>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)] m-0">…</p>
        ) : debts.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] m-0">{t('editor.todayDebtsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2 m-0 list-none p-0">
            {debts.map((debt) => (
              <li
                key={debt.frontmatter.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Coins size={14} className="shrink-0 text-[var(--text-muted)]" />
                  <div className="min-w-0">
                    <p className="truncate m-0 text-sm font-medium text-[var(--text-primary)]">
                      {debt.frontmatter.personName}
                    </p>
                    <p className="m-0 text-xs text-[var(--text-secondary)]">
                      {debt.frontmatter.direction === 'lent'
                        ? t('frontmatter.directionLent')
                        : t('frontmatter.directionBorrowed')}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                  {formatMoney(debt.frontmatter.amount, debt.frontmatter.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
