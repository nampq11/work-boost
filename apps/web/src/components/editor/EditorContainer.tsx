import { Code, Coins, Eye, FileText, FloppyDisk } from '@phosphor-icons/react';
import { Button } from '@work-boost/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAutosave } from '../../hooks/useAutosave.ts';
import { ApiError, api } from '../../lib/api-client.ts';
import { useI18n } from '../../lib/i18n.tsx';
import type { DebtDocument, TodayDailyDocument } from '../../lib/types.ts';
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

function TodayPanel() {
  const { t } = useI18n();
  const [captureText, setCaptureText] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [daily, setDaily] = useState<TodayDailyDocument | null>(null);
  const [debts, setDebts] = useState<DebtDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<Promise<string> | null>(null);

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

  // Auto-grow the capture textarea as the user types.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [captureText]);

  function getThreadId(): Promise<string> {
    if (!threadRef.current) {
      threadRef.current = api.createThread().then((thread) => thread.id);
    }
    return threadRef.current;
  }

  async function submitCapture(): Promise<void> {
    const text = captureText.trim();
    if (!text || capturing) return;
    setCapturing(true);
    setCaptureError('');
    try {
      const threadId = await getThreadId();
      const response = await api.createResponse(threadId, text);
      let output = '';
      for await (const event of api.streamResponse(response.id)) {
        if (event.type === 'response.failed') {
          throw new ApiError(
            event.response?.error?.code ?? 'AI_UNAVAILABLE',
            event.response?.error?.message ?? t('editor.todayCaptureFailed'),
          );
        }
        if (event.delta) {
          output += event.delta;
        } else if (event.type === 'response.completed' && event.response?.outputText && !output) {
          output = event.response.outputText;
        }
      }
      setLastResponse(output.trim());
      setCaptureText('');
      await refreshToday();
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : t('editor.todayCaptureFailed'));
    } finally {
      setCapturing(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitCapture();
    }
  }

  const report = daily?.report ?? null;
  const hasReport =
    report !== null &&
    (report.completed.length > 0 || report.incomplete.length > 0 || report.planned.length > 0);
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

  return (
    <div className="max-w-4xl mx-auto px-10 py-10 flex flex-col gap-6">
      {/* Capture box */}
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] m-0">
          {t('editor.todayTitle')}
        </h1>
        <textarea
          ref={textareaRef}
          autoFocus
          value={captureText}
          onChange={(event) => setCaptureText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={t('editor.todayPrompt')}
          disabled={capturing}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-[15px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-blue)] disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--text-muted)] m-0">{t('editor.todayPromptHint')}</p>
          {capturing && (
            <span className="text-[11px] text-[var(--accent-blue)]">
              {t('editor.todayCaptureSending')}
            </span>
          )}
        </div>
      </section>

      {/* Capture error */}
      {captureError && <p className="text-[13px] text-[var(--accent-red)] m-0">{captureError}</p>}

      {/* AI summary line shown after a successful capture */}
      {lastResponse && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)]">
          {lastResponse}
        </div>
      )}

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
            {sections.map((section) => (
              <div key={section.key} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-tight text-[var(--text-secondary)] m-0">
                  {section.title}
                </h3>
                {section.tasks.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] m-0">- N/A</p>
                ) : (
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
                )}
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
