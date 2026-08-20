import React from 'react';
import { useEffect, useState } from 'react';
import { useAutosave } from '../../hooks/useAutosave.ts';
import { useWorkspaceStore } from '../../store/workspace-store.ts';
import { FrontmatterInspector } from './FrontmatterInspector.tsx';
import { SourceEditor } from './SourceEditor.tsx';
import { TiptapEditor } from './TiptapEditor.tsx';

export function EditorContainer() {
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
  if (!document) {
    return (
      <div className="empty-state">
        <strong>Select a markdown file</strong>
        <span>Choose a note from the workspace tree or press Ctrl K.</span>
      </div>
    );
  }
  return (
    <div className="editor-container">
      <div className="editor-heading">
        <div>
          <span className="eyebrow">Markdown document</span>
          <h1>{document.path.split('/').pop()}</h1>
        </div>
        <div className="editor-actions">
          <button onClick={() => setSourceMode(!sourceMode)}>
            {sourceMode ? 'WYSIWYG' : 'Raw source'}
          </button>
          <button onClick={() => void save().catch(() => undefined)}>Save</button>
        </div>
      </div>
      <FrontmatterInspector />
      {sourceMode ? (
        <SourceEditor value={draft} onChange={updateBody} />
      ) : (
        <TiptapEditor value={draft} onChange={updateBody} />
      )}
      <div className="shortcut-hint">
        {sourceMode ? 'Raw Source Mode' : 'Ctrl + Alt + U to edit raw markdown'}
      </div>
    </div>
  );
}
