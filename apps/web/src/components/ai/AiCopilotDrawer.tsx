import React, { FormEvent, useState } from 'react';
import { Sparkle, X, PaperPlaneRight } from '@phosphor-icons/react';
import { api } from '../../lib/api-client.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { Button } from '../ui/Button.tsx';

export function AiCopilotDrawer() {
  const open = useUiStore((state) => state.copilotOpen);
  const toggle = useUiStore((state) => state.toggleCopilot);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [sending, setSending] = useState(false);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setMessage('');
    setMessages((items) => [...items, { role: 'user', text }]);
    setSending(true);
    try {
      const result = await api.sendMessage(text, 'workspace-copilot');
      setMessages((items) => [...items, { role: 'assistant', text: result.response }]);
    } catch (error) {
      setMessages((items) => [
        ...items,
        {
          role: 'assistant',
          text: error instanceof Error ? error.message : 'The assistant is unavailable.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="w-80 border-l border-[var(--border)] bg-[var(--surface-sidebar)] flex flex-col shrink-0 select-none">
      {/* Drawer Header */}
      <div className="h-12 px-3.5 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-sm text-[var(--text-primary)]">
          <Sparkle size={15} className="text-[var(--accent-blue)]" weight="fill" />
          <span>Copilot Workspace</span>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle}>
          <X size={15} />
        </Button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center py-10 text-sm text-[var(--text-muted)] leading-relaxed">
            <Sparkle size={28} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium text-[var(--text-primary)] mb-2">How can I help you today?</p>
            <p>Summarize notes, query daily tasks, or record debt entries.</p>
          </div>
        )}
        {messages.map((item, index) => (
          <div
            key={index}
            className={`flex flex-col gap-1 text-sm max-w-[90%] ${
              item.role === 'user' ? 'self-end items-end' : 'self-start items-start'
            }`}
          >
            <div
              className={`p-3 rounded-lg leading-relaxed ${
                item.role === 'user'
                  ? 'bg-[var(--accent-blue)] text-white'
                  : 'bg-[var(--surface-app)] border border-[var(--border)] text-[var(--text-primary)]'
              }`}
            >
              {item.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="text-sm text-[var(--text-muted)] flex items-center gap-1.5 italic">
            <Sparkle size={13} className="animate-spin" /> Thinking...
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={submit}
        className="p-3 border-t border-[var(--border)] bg-[var(--surface-app)]"
      >
        <div className="relative">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit(event);
              }
            }}
            placeholder="Ask Work Boost..."
            rows={3}
            className="w-full p-3 pr-10 text-sm bg-[var(--surface-hover)] border border-[var(--border)] rounded-md outline-none resize-none focus:border-[var(--accent-blue)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !message.trim()}
            className="absolute right-2 bottom-3 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10"
          >
            <PaperPlaneRight size={14} weight="fill" />
          </Button>
        </div>
      </form>
    </aside>
  );
}
