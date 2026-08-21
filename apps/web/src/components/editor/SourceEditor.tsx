import React from 'react';

interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function SourceEditor({ value, onChange }: SourceEditorProps) {
  return (
    <textarea
      className="w-full min-h-[500px] p-5 rounded-lg bg-[var(--surface-sidebar)] border border-[var(--border)] text-[var(--text-primary)] font-mono text-sm leading-relaxed outline-none focus:border-[var(--accent-blue)] resize-y"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      aria-label="Raw markdown source"
    />
  );
}
