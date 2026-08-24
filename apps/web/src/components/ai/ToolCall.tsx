import type { ToolCallMessagePart } from '@assistant-ui/react';
import {
  CaretRight,
  Check,
  Clock,
  FileText,
  FloppyDisk,
  WarningCircle,
  Wrench,
} from '@phosphor-icons/react';
import React, { useEffect, useId, useState } from 'react';
import { type Translate, useI18n } from '../../lib/i18n.tsx';

interface ToolCallProps {
  part: ToolCallMessagePart;
}

const toolLabels: Record<string, { label: string; activeLabel: string }> = {
  daily_work: { label: 'Updated daily work', activeLabel: 'Updating daily work' },
  debt: { label: 'Updated debts', activeLabel: 'Updating debts' },
  workspace: { label: 'Read workspace', activeLabel: 'Reading workspace' },
  create_note: { label: 'Saved a note', activeLabel: 'Saving a note' },
  get_current_time: { label: 'Checked the time', activeLabel: 'Checking the time' },
};

function stringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function getToolCopy(toolName: string): { label: string; activeLabel: string } {
  return (
    toolLabels[toolName] ?? {
      label: `Ran ${toolName.replaceAll('_', ' ')}`,
      activeLabel: `Running ${toolName.replaceAll('_', ' ')}`,
    }
  );
}

function getQuery(args: ToolCallMessagePart['args'], t: Translate): string {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return t('tool.queryDefault');
  const [key, value] = entries[0];
  const text = typeof value === 'string' ? value : stringify(value).replaceAll('\n', ' ');
  return `${key}=${text}`.slice(0, 42);
}

function getResultText(result: unknown): string {
  if (result && typeof result === 'object' && 'content' in result) {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (part): part is { type: 'text'; text: string } =>
            Boolean(part) &&
            typeof part === 'object' &&
            part.type === 'text' &&
            typeof part.text === 'string',
        )
        .map((part) => part.text)
        .join('\n');
      if (text) return text;
    }
  }
  return stringify(result);
}

function ToolIcon({ toolName }: { toolName: string }) {
  if (toolName.includes('daily')) return <FileText size={14} aria-hidden="true" />;
  if (toolName.includes('debt')) return <FloppyDisk size={14} aria-hidden="true" />;
  if (toolName.includes('time')) return <Clock size={14} aria-hidden="true" />;
  return <Wrench size={14} aria-hidden="true" />;
}

export function ToolCall({ part }: ToolCallProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const running = !('result' in part) && !part.isError;
  const copy = getToolCopy(part.toolName);
  const request = part.argsText || stringify(part.args);
  const result = getResultText(part.result);

  return (
    <div data-slot="tool-call" className="w-full max-w-full">
      <button
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group/trigger flex max-w-full items-center gap-2 rounded-md py-1 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ToolIcon toolName={part.toolName} />
        <span className={running ? 'copilot-loading-label' : ''}>
          {running ? copy.activeLabel : copy.label}
        </span>
        <span className="min-w-0 truncate rounded-md bg-[var(--surface-hover)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
          {getQuery(part.args, t)}
        </span>
        <span className="ml-auto flex shrink-0 items-center justify-end pl-1">
          {part.isError ? (
            <WarningCircle
              size={14}
              className="text-[var(--accent-red)]"
              aria-label={t('tool.failed')}
            />
          ) : !running ? (
            <Check
              size={14}
              weight="bold"
              className="text-[var(--accent-green)]"
              aria-label={t('tool.completed')}
            />
          ) : null}
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className="mb-2 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-card)] text-xs"
        >
          <div className="px-3 py-2.5">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('tool.request')}
            </p>
            <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {request}
            </pre>
          </div>
          <div className="mx-3 h-px bg-[var(--border)]" />
          <div className="px-3 py-2.5">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t('tool.result')}
            </p>
            <pre
              className={`m-0 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${part.isError ? 'text-[var(--accent-red)]' : 'text-[var(--text-primary)]'}`}
            >
              {running ? t('tool.waiting') : result}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

interface ToolTimelineProps {
  parts: readonly ToolCallMessagePart[];
  isMessageRunning: boolean;
}

export function ToolTimeline({ parts, isMessageRunning }: ToolTimelineProps) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const runningPart = [...parts].reverse().find((part) => !('result' in part) && !part.isError);
  const hasRunningTool = Boolean(runningPart);
  const countLabel = `${parts.length} tool${parts.length === 1 ? '' : 's'}`;
  const label = runningPart ? getToolCopy(runningPart.toolName).activeLabel : `${countLabel} used`;

  useEffect(() => {
    if (!isMessageRunning) setOpen(false);
  }, [isMessageRunning]);

  return (
    <div data-slot="tool-timeline" className="mb-6 w-full max-w-full">
      <button
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group/trigger flex items-center gap-1.5 rounded-md py-1 text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <CaretRight
          size={14}
          weight="bold"
          aria-hidden="true"
          className={`shrink-0 opacity-60 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        <span className={hasRunningTool ? 'copilot-loading-label' : ''}>{label}</span>
        <span className="rounded-md bg-[var(--surface-hover)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
          {countLabel}
        </span>
      </button>
      {open && (
        <div id={panelId} className="ml-1 border-l border-[var(--border)] pl-3 pt-2">
          <div className="flex flex-col gap-1.5">
            {parts.map((part) => (
              <ToolCall key={part.toolCallId} part={part} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
