import React from 'react';
interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
}
export function SourceEditor({ value, onChange }: SourceEditorProps) {
  return (
    <textarea
      className="source-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      aria-label="Raw markdown source"
    />
  );
}
