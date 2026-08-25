import { unstable_useComposerInput } from '@assistant-ui/react';
import { FileText } from '@phosphor-icons/react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  applyMention,
  fileMentionItems,
  filterMentionItems,
  findMentionQuery,
} from '../../lib/file-mention.ts';
import { type Translate, useI18n } from '../../lib/i18n.tsx';
import { useWorkspaceStore } from '../../store/workspace-store.ts';

function kindLabel(kind: string, t: Translate): string | null {
  if (kind === 'daily') return t('thread.mention.kindDaily');
  if (kind === 'debt') return t('thread.mention.kindDebt');
  return null;
}

/**
 * Workspace-file picker for the composer. Opens when the input ends with a
 * trailing `@query`; selecting a row replaces it with `@path `. All bridge
 * usage (`unstable_useComposerInput`) lives here and in CopilotComposer so an
 * assistant-ui upgrade is contained to these files.
 */
export function FileMentionMenu() {
  const { t } = useI18n();
  const { value, setText } = unstable_useComposerInput();
  const nodes = useWorkspaceStore((state) => state.nodes);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);

  const query = findMentionQuery(value);
  const allItems = useMemo(() => fileMentionItems(nodes), [nodes]);
  const items = useMemo(
    () => (query === null ? [] : filterMentionItems(allItems, query)).slice(0, 8),
    [allItems, query],
  );
  const open = query !== null && query !== dismissedQuery;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    setActiveIndex((current) => (items.length === 0 ? 0 : Math.min(current, items.length - 1)));
  }, [items.length]);

  // Key events bubble up from ComposerPrimitive.Input through the composer
  // root, so a capture-phase document listener intercepts them before
  // assistant-ui's Enter-to-submit handler runs.
  useEffect(() => {
    if (!open || items.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.copilot-composer')) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((current) => (current + 1) % items.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((current) => (current - 1 + items.length) % items.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        setText(applyMention(value, items[activeIndex].id));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDismissedQuery(query);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, items, activeIndex, value, setText, query]);

  if (!open) return null;

  return (
    <div className="file-mention-menu" role="listbox" aria-label={t('thread.mention.title')}>
      {items.length === 0 && (
        <div className="file-mention-empty">{t('thread.mention.noFiles')}</div>
      )}
      {items.map((item, index) => {
        const kind = kindLabel(item.kind, t);
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`file-mention-item${index === activeIndex ? ' file-mention-item-active' : ''}`}
            onMouseDown={(event) => {
              // mousedown keeps composer focus; click would blur the input.
              event.preventDefault();
              setText(applyMention(value, item.id));
            }}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <FileText size={13} className="file-mention-icon" />
            <span className="file-mention-label">{item.label}</span>
            <span className="file-mention-description">
              {kind ? `${kind} · ${item.description}` : item.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
