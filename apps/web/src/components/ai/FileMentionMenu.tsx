import { FileText, Folder } from '@phosphor-icons/react';
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
  if (kind === 'folder') return t('thread.mention.kindFolder');
  return null;
}

/**
 * Workspace-file picker for a text input. Opens when the input ends with a
 * trailing `@query`; selecting a row replaces it with `@path `.
 *
 * Controlled: callers pass the current text and an `onApply` callback, so the
 * same picker works for the Copilot composer (fed by `unstable_useComposerInput`)
 * and the Today capture box (fed by its own state). The `unstable_useComposerInput`
 * bridge itself lives only in CopilotComposer, so an assistant-ui upgrade that
 * renames or removes the hook stays a one-file change.
 */
export function FileMentionMenu({
  value,
  onApply,
  containerClass,
}: {
  value: string;
  onApply: (text: string) => void;
  containerClass: string;
}) {
  const { t } = useI18n();
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

  // Key events bubble up from the input, so a capture-phase document listener
  // intercepts them before any Enter-to-submit handler runs. `containerClass`
  // scopes the listener to this picker's input so the Copilot composer and the
  // Today capture box can both mount a picker without stealing each other's keys.
  useEffect(() => {
    if (!open || items.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(containerClass)) return;
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
        onApply(applyMention(value, items[activeIndex].id));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDismissedQuery(query);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, items, activeIndex, value, onApply, containerClass, query]);

  // The picker is driven by the input text, not focus, so a pointerdown outside
  // its container must dismiss it (selecting an option keeps focus on the input,
  // so that click stays inside and does not dismiss). Mirrors Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(containerClass)) setDismissedQuery(query);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, containerClass, query]);

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
            className={`file-mention-item${
              index === activeIndex ? ' file-mention-item-active' : ''
            }`}
            onMouseDown={(event) => {
              // mousedown keeps the input focused; click would blur it.
              event.preventDefault();
              onApply(applyMention(value, item.id));
            }}
            onMouseEnter={() => setActiveIndex(index)}
          >
            {item.kind === 'folder' ? (
              <Folder size={13} className="file-mention-icon" />
            ) : (
              <FileText size={13} className="file-mention-icon" />
            )}
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
