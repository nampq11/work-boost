import {
  Code,
  ListBullets,
  ListChecks,
  Quotes,
  TextB,
  TextHOne,
  TextHTwo,
  TextItalic,
} from '@phosphor-icons/react';
import CodeBlock from '@tiptap/extension-code-block';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from '@work-boost/ui';
import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import { htmlToMarkdown, markdownToHtml } from '../../lib/markdown-parser.ts';

interface TiptapEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TiptapEditor({ value, onChange }: TiptapEditorProps) {
  const { t } = useI18n();
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
    editorProps: {
      attributes: {
        class: 'tiptap-content prose dark:prose-invert max-w-none focus:outline-none min-h-[300px]',
        spellcheck: 'false',
      },
    },
  });

  useEffect(() => {
    if (editor && renderedValue.current !== value) {
      editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
      renderedValue.current = value;
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="p-8 text-sm text-[var(--text-muted)]">{t('tiptap.loading')}</div>;
  }

  return (
    <div className="flex flex-col min-h-[400px]">
      {/* Sleek Floating Toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-0.5 py-1.5 px-1 mb-4 border-b border-[var(--border)] bg-[var(--surface-app)] backdrop-blur-sm select-none">
        <Button
          variant={editor.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title={t('tiptap.heading1')}
        >
          <TextHOne size={16} />
        </Button>
        <Button
          variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title={t('tiptap.heading2')}
        >
          <TextHTwo size={16} />
        </Button>
        <div className="w-[1px] h-4 bg-[var(--border)] mx-1.5" />
        <Button
          variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleBold().run()}
          title={t('tiptap.bold')}
        >
          <TextB size={16} weight="bold" />
        </Button>
        <Button
          variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title={t('tiptap.italic')}
        >
          <TextItalic size={16} />
        </Button>
        <div className="w-[1px] h-4 bg-[var(--border)] mx-1.5" />
        <Button
          variant={editor.isActive('taskList') ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title={t('tiptap.taskList')}
        >
          <ListChecks size={16} />
        </Button>
        <Button
          variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title={t('tiptap.bulletList')}
        >
          <ListBullets size={16} />
        </Button>
        <Button
          variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title={t('tiptap.quote')}
        >
          <Quotes size={16} />
        </Button>
        <Button
          variant={editor.isActive('codeBlock') ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title={t('tiptap.codeBlock')}
        >
          <Code size={16} />
        </Button>
      </div>

      {/* Editor Surface */}
      <EditorContent editor={editor} />
    </div>
  );
}
