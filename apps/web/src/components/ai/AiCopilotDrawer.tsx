import React from 'react';
import { FormEvent, useState } from 'react';
import { api } from '../../lib/api-client.ts';
import { useUiStore } from '../../store/ui-store.ts';

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
    <aside className="copilot">
      <div className="drawer-heading">
        <div>
          <span className="eyebrow">Workspace assistant</span>
          <h2>Copilot</h2>
        </div>
        <button onClick={toggle}>Close</button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted">Ask about your daily work, summarize notes, or record a debt.</p>
        )}
        {messages.map((item, index) => (
          <div className={`chat-bubble ${item.role}`} key={`${item.role}-${index}`}>
            {item.text}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask Work Boost..."
          rows={3}
        />
        <button className="primary-button" disabled={sending}>
          {sending ? 'Thinking...' : 'Send'}
        </button>
      </form>
    </aside>
  );
}
