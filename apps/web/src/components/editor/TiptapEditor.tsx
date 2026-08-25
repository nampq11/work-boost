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
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from '@work-boost/ui';
import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../lib/i18n.tsx';
import type { MessageKey } from '../../lib/locales/en.ts';
import { htmlToMarkdown, markdownToHtml } from '../../lib/markdown-parser.ts';

interface TiptapEditorProps {
  value: string;
  onChange: (value: string) => void;
  // Lets the parent host the formatting toolbar outside this component
  // (it lives in the document header row next to the view tabs)
  onEditorReady?: (editor: Editor | null) => void;
}

export function TiptapEditor({ value, onChange, onEditorReady }: TiptapEditorProps) {
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
        // Centered readable column; the scroll container adds horizontal padding
        class:
          'tiptap-content prose dark:prose-invert mx-auto max-w-3xl focus:outline-none min-h-[300px]',
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

  useEffect(() => {
    onEditorReady?.(editor);
    // Editor is destroyed on unmount, so clear the parent's reference
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  if (!editor) {
    return <div className="p-8 text-sm text-[var(--text-muted)]">{t('tiptap.loading')}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-app)]">
      {/* Editor Surface: scrolls internally; content sits in a
          centered readable column like GitHub's Preview mode (ADR 0013) */}
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto px-8" />
    </div>
  );
}

// One entry per toolbar control; strings separate visual divider groups.
type ToolbarItem =
  | {
      titleKey: MessageKey;
      icon: React.ReactNode;
      isActive: (editor: Editor) => boolean;
      run: (editor: Editor) => void;
    }
  | 'divider';

const toolbarItems: ToolbarItem[] = [
  {
    titleKey: 'tiptap.heading1',
    icon: <TextHOne size={16} />,
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    titleKey: 'tiptap.heading2',
    icon: <TextHTwo size={16} />,
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  'divider',
  {
    titleKey: 'tiptap.bold',
    icon: <TextB size={16} weight="bold" />,
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    titleKey: 'tiptap.italic',
    icon: <TextItalic size={16} />,
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  'divider',
  {
    titleKey: 'tiptap.taskList',
    icon: <ListChecks size={16} />,
    isActive: (editor) => editor.isActive('taskList'),
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    titleKey: 'tiptap.bulletList',
    icon: <ListBullets size={16} />,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    titleKey: 'tiptap.quote',
    icon: <Quotes size={16} />,
    isActive: (editor) => editor.isActive('blockquote'),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    titleKey: 'tiptap.codeBlock',
    icon: <Code size={16} />,
    isActive: (editor) => editor.isActive('codeBlock'),
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

export function EditorToolbar({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  return (
    <div className="ml-auto flex select-none items-center gap-0.5">
      {toolbarItems.map((item) =>
        item === 'divider' ? (
          <div key={item} className="mx-1.5 h-4 w-[1px] bg-[var(--border)]" />
        ) : (
          <Button
            key={item.titleKey}
            variant={item.isActive(editor) ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => item.run(editor)}
            title={t(item.titleKey)}
          >
            {item.icon}
          </Button>
        ),
      )}
    </div>
  );
}
