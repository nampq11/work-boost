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
    // The container must have a definite height so .cm-editor { height: 100% }
    // resolves and CodeMirror scrolls internally (ADR 0013).
    <div ref={containerRef} className="h-full w-full bg-[var(--surface-app)]" />
  );
}
