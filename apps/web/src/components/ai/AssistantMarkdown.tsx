import { cn } from '@work-boost/ui';
import DOMPurify from 'dompurify';
import React, { useMemo } from 'react';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

interface AssistantMarkdownProps {
  content: string;
  className?: string;
}

// File path patterns for workspace files (.md, .txt, .json)
const WORKSPACE_FILE_EXTENSIONS = ['md', 'txt', 'json'];
const FILE_PATH_PATTERN = /(?:`?)([\w\-./]+\/[\w\-./]+\.(?:md|txt|json))(?:`?)/g;
const FILE_LINK_PATTERN = /\[([^\]]+)\]\(([\w\-./]+\.(?:md|txt|json))\)/g;
const CODE_BLOCK_PLACEHOLDER = '__CODE_BLOCK_';

function isWorkspaceFile(filePath: string): boolean {
  return (
    filePath.includes('/') && WORKSPACE_FILE_EXTENSIONS.some((ext) => filePath.endsWith(`.${ext}`))
  );
}

function convertMarkdownToHtml(markdown: string): string {
  const codeBlocks: string[] = [];

  // Preserve code blocks to avoid processing content inside them
  let html = markdown.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `${CODE_BLOCK_PLACEHOLDER}${codeBlocks.length - 1}__`;
  });

  // Convert markdown links to file paths into clickable links
  html = html.replace(FILE_LINK_PATTERN, (match, text, path) => {
    const filePath = path.trim();
    return `<a href="#" data-file-path="${filePath}" class="file-link">${text || filePath}</a>`;
  });

  // Convert standalone file paths to clickable links
  html = html.replace(FILE_PATH_PATTERN, (match, path) => {
    const filePath = path.trim();
    if (isWorkspaceFile(filePath)) {
      return `<a href="#" data-file-path="${filePath}" class="file-link inline-flex items-center gap-1"><code class="bg-[var(--surface-hover)] px-1 py-0.5 rounded text-xs text-[var(--text-secondary)]">${filePath}</code></a>`;
    }
    return match;
  });

  // Restore code blocks
  html = html.replace(
    new RegExp(`${CODE_BLOCK_PLACEHOLDER}(\\d+)__`, 'g'),
    (_, index) => codeBlocks[Number(index)],
  );

  // Convert markdown syntax to HTML
  html = html
    .replace(/^### (.*)$/gm, '<h3 class="font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="font-semibold mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(
      /^- \[ \] (.*)$/gm,
      '<li data-type="taskItem" data-checked="false" class="ml-4">- [ ] $1</li>',
    )
    .replace(
      /^- \[x\] (.*)$/gim,
      '<li data-type="taskItem" data-checked="true" class="ml-4">- [x] $1</li>',
    )
    .replace(/^- (.*)$/gm, '<li class="ml-4">- $1</li>');

  // Wrap consecutive list items in <ul>
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-2">$&</ul>');

  // Wrap plain text paragraphs
  html = html
    .split('\n\n')
    .map((block) => {
      if (block.startsWith('<') || block.trim() === '') {
        return block;
      }
      return `<p class="my-2 leading-relaxed">${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

function sanitizeHtml(html: string): string {
  const purify =
    typeof DOMPurify?.sanitize === 'function'
      ? DOMPurify
      : typeof DOMPurify === 'function' && typeof window !== 'undefined'
        ? DOMPurify(window)
        : null;

  if (purify) {
    return purify.sanitize(html, {
      ADD_ATTR: ['data-file-path', 'data-type', 'data-checked'],
    });
  }

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '')
    .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, '');
}

export function renderAssistantMarkdownHtml(content: string): string {
  const html = convertMarkdownToHtml(content);
  return sanitizeHtml(html);
}

export function AssistantMarkdown({ content, className }: AssistantMarkdownProps) {
  const selectFile = useWorkspaceStore((state) => state.selectFile);

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    const link = (e.target as HTMLElement).closest('a.file-link');
    if (!link) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const filePath = link.getAttribute('data-file-path');
    if (!filePath) {
      return;
    }

    void selectFile(filePath).catch((error) => {
      console.error('[AssistantMarkdown] Failed to open file:', error);
    });
  }

  const htmlContent = useMemo(() => renderAssistantMarkdownHtml(content), [content]);

  return (
    <div
      className={cn(
        'copilot-markdown text-sm text-[var(--text-primary)]',
        'prose prose-sm max-w-none',
        'prose-headings:font-semibold prose-headings:text-[var(--text-primary)]',
        'prose-p:text-[var(--text-primary)] prose-p:leading-relaxed',
        'prose-strong:text-[var(--text-primary)]',
        'prose-em:text-[var(--text-primary)]',
        'prose-code:text-[var(--text-secondary)] prose-code:bg-[var(--surface-hover)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs',
        'prose-pre:bg-[var(--surface-hover)] prose-pre:border prose-pre:border-[var(--border)] prose-pre:rounded prose-pre:p-3',
        'prose-li:text-[var(--text-primary)]',
        '[&_a.file-link]:text-[var(--accent-blue)] [&_a.file-link]:underline [&_a.file-link]:underline-offset-2 [&_a.file-link]:hover:no-underline [&_a.file-link]:cursor-pointer',
        className,
      )}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
