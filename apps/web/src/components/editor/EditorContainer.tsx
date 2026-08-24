import { useAui, useAuiState } from '@assistant-ui/react';
import { Code, Coins, Eye, FileText, FloppyDisk, PaperPlaneRight } from '@phosphor-icons/react';
import { Button } from '@work-boost/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAutosave } from '../../hooks/useAutosave.ts';
import { api } from '../../lib/api-client.ts';
import { useI18n } from '../../lib/i18n.tsx';
import type { DebtDocument, TodayDailyDocument } from '../../lib/types.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';
import { FrontmatterInspector } from './FrontmatterInspector.tsx';
import { SourceEditor } from './SourceEditor.tsx';
import { TiptapEditor } from './TiptapEditor.tsx';

export function EditorContainer() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.activeDocument);
  const draft = useWorkspaceStore((state) => state.draft);
  const updateBody = useWorkspaceStore((state) => state.updateBody);
  const save = useWorkspaceStore((state) => state.save);
  const [sourceMode, setSourceMode] = useState(false);

  useAutosave();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        setSourceMode((mode) => !mode);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Today view (front door): shown whenever no file is selected
  if (!document) {
    return <TodayPanel />;
  }

  const title =
    document.path
      .split('/')
      .pop()
      ?.replace(/\.(md|html)$/, '') ?? '';

  return (
    <div className="max-w-4xl mx-auto px-10 py-10">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 mb-6 border-b border-[var(--border)]">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] m-0">
          {title}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSourceMode(!sourceMode)}
            className="gap-1.5 text-sm"
          >
            {sourceMode ? <Eye size={14} /> : <Code size={14} />}
            <span>{t(sourceMode ? 'editor.wysiwyg' : 'editor.rawSource')}</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void save().catch(() => undefined)}
            className="gap-1.5 bg-[var(--text-primary)] text-[var(--text-inverse)] hover:opacity-90"
          >
            <FloppyDisk size={14} />
            <span>{t('editor.save')}</span>
          </Button>
        </div>
      </div>

      {/* Frontmatter Inspector */}
      <FrontmatterInspector />

      {/* Editor Body */}
      {sourceMode ? (
        <SourceEditor value={draft} onChange={updateBody} />
      ) : (
        <TiptapEditor value={draft} onChange={updateBody} />
      )}
    </div>
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
  const aui = useAui();
  const [captureText, setCaptureText] = useState('');
  const [daily, setDaily] = useState<TodayDailyDocument | null>(null);
  const [debts, setDebts] = useState<DebtDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The capture box talks to the same thread as the Copilot workspace so both
  // surfaces share one conversation and one AI context.
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const wasRunningRef = useRef(false);

  const refreshToday = useCallback(async () => {
    const [todayDoc, pendingDebts] = await Promise.all([
      api.getDailyToday(),
      api.listDebts({ status: 'pending' }),
    ]);
    setDaily(todayDoc);
    setDebts(pendingDebts);
    await useWorkspaceStore.getState().loadFiles();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refreshToday().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshToday]);

  // Refresh summary and debts once a run on the shared thread finishes.
  useEffect(() => {
    const finished = wasRunningRef.current && !isRunning;
    wasRunningRef.current = isRunning;
    if (finished) void refreshToday().catch(() => undefined);
  }, [isRunning, refreshToday]);

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

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitCapture();
    }
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
  const hasReport = visibleSections.length > 0 || Boolean(daily?.customSections);
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
        <textarea
          ref={textareaRef}
          autoFocus
          value={captureText}
          onChange={(event) => setCaptureText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={t('editor.todayPrompt')}
          disabled={isRunning}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-[15px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-blue)] disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--text-muted)] m-0">
            {isRunning ? t('editor.todayCaptureSending') : t('editor.todayPromptHint')}
          </p>
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

      {/* Today's summary */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-tight text-[var(--text-primary)] m-0">
          <FileText size={15} className="text-[var(--accent-blue)]" />
          {t('editor.todaySummaryTitle')}
        </h2>
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
            {daily?.customSections && (
              <div className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                {daily.customSections}
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
