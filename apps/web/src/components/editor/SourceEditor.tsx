import React from 'react';
import { useCodeMirror } from '../../hooks/useCodeMirror.ts';
import { useI18n } from '../../lib/i18n.tsx';

interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function SourceEditor({ value, onChange }: SourceEditorProps) {
  const { t } = useI18n();
  const containerRef = useCodeMirror({
    value,
    onChange,
    ariaLabel: t('sourceEditor.aria'),
  });
  return (
    <div
      ref={containerRef}
      className="w-full min-h-[500px] max-h-[75vh] overflow-y-auto rounded-lg bg-[var(--surface-sidebar)] border border-[var(--border)]"
    />
  );
}
