import CodeBlock from '@tiptap/extension-code-block';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import React from 'react';
import { useEffect, useRef } from 'react';
import { htmlToMarkdown, markdownToHtml } from '../../lib/markdown-parser.ts';

interface TiptapEditorProps {
  value: string;
  onChange: (value: string) => void;
}
export function TiptapEditor({ value, onChange }: TiptapEditorProps) {
  const renderedValue = useRef(value);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlock,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: markdownToHtml(value),
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      const markdown = htmlToMarkdown(currentEditor.getHTML());
      renderedValue.current = markdown;
      onChange(markdown);
    },
    editorProps: { attributes: { class: 'tiptap-content', spellcheck: 'true' } },
  });
  useEffect(() => {
    if (editor && renderedValue.current !== value) {
      editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
      renderedValue.current = value;
    }
  }, [editor, value]);
  if (!editor) return <div className="editor-loading">Loading editor...</div>;
  return (
    <div className="editor-shell">
      <div className="editor-toolbar">
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive('heading', { level: 1 }) ? 'selected' : ''}
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'selected' : ''}
        >
          Bold
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'selected' : ''}
        >
          Italic
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={editor.isActive('taskList') ? 'selected' : ''}
        >
          Tasks
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'selected' : ''}
        >
          Code
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
