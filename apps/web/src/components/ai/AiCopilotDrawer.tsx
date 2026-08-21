import { Check, Copy, PaperPlaneRight, Sparkle, X } from '@phosphor-icons/react';
import React, { FormEvent, useEffect, useRef, useState } from 'react';
import {
  type AuthLoginEvent,
  type AuthLoginSession,
  type AuthStatus,
  api,
} from '../../lib/api-client.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { Button } from '../ui/Button.tsx';
import { ResizablePanel } from '../ui/resizable.tsx';

export function AiCopilotDrawer() {
  const open = useUiStore((state) => state.copilotOpen);
  const toggle = useUiStore((state) => state.toggleCopilot);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginSession, setLoginSession] = useState<AuthLoginSession | null>(null);
  const [deviceCode, setDeviceCode] = useState<Extract<
    AuthLoginEvent,
    { type: 'device_code' }
  > | null>(null);
  const [authProgress, setAuthProgress] = useState('');
  const [authError, setAuthError] = useState('');
  const [copied, setCopied] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const loginSessionRef = useRef<AuthLoginSession | null>(null);
  const authRequestRef = useRef(0);
  const loginRequestRef = useRef(0);

  function clearLoginSession(): void {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    loginSessionRef.current = null;
    setLoginSession(null);
  }

  async function refreshAuthStatus() {
    const requestId = ++authRequestRef.current;
    setAuthLoading(true);
    setAuthError('');
    try {
      const status = await api.getAuthStatus();
      if (requestId === authRequestRef.current) setAuthStatus(status);
    } catch (error) {
      if (requestId === authRequestRef.current) {
        setAuthStatus(null);
        setAuthError(error instanceof Error ? error.message : 'The AI provider is unavailable.');
      }
    } finally {
      if (requestId === authRequestRef.current) setAuthLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refreshAuthStatus();
    return () => {
      authRequestRef.current += 1;
      loginRequestRef.current += 1;
      const session = loginSessionRef.current;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      loginSessionRef.current = null;
      setLoginSession(null);
      if (session) void api.cancelAuthLogin(session.loginId).catch(() => undefined);
    };
  }, [open]);

  if (!open) return null;

  function handleAuthEvent(event: AuthLoginEvent) {
    if (event.type === 'device_code') {
      setDeviceCode(event);
      setAuthProgress('Waiting for authorization...');
    } else if (event.type === 'progress') {
      setAuthProgress(event.message);
    } else if (event.type === 'completed') {
      clearLoginSession();
      setDeviceCode(null);
      setAuthError('');
      void refreshAuthStatus();
    } else if (event.type === 'failed') {
      clearLoginSession();
      setAuthError(event.message);
      void refreshAuthStatus();
    } else if (event.type === 'cancelled') {
      clearLoginSession();
      setAuthError('Login cancelled.');
      void refreshAuthStatus();
    }
  }

  async function startLogin() {
    if (authLoading || loginSession) return;
    const requestId = ++loginRequestRef.current;
    setAuthLoading(true);
    setAuthError('');
    setDeviceCode(null);
    setAuthProgress('Starting secure login...');
    try {
      const session = await api.startAuthLogin(
        authStatus?.provider ?? '',
        authStatus?.auth.status === 'refresh_failed',
      );
      if (requestId !== loginRequestRef.current) {
        void api.cancelAuthLogin(session.loginId).catch(() => undefined);
        return;
      }
      clearLoginSession();
      loginSessionRef.current = session;
      setLoginSession(session);
      unsubscribeRef.current = api.subscribeAuthLogin(session.loginId, handleAuthEvent, () => {
        setAuthError('The login progress connection was interrupted.');
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'The AI provider is unavailable.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function logoutAuth() {
    setAuthLoading(true);
    setAuthError('');
    try {
      await api.logoutAuth();
      await refreshAuthStatus();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to log out.');
    } finally {
      setAuthLoading(false);
    }
  }
  async function cancelLogin() {
    const session = loginSession;
    if (!session) return;
    clearLoginSession();
    setDeviceCode(null);
    setAuthProgress('');
    try {
      await api.cancelAuthLogin(session.loginId);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to cancel login.');
    }
    await refreshAuthStatus();
  }

  async function closeDrawer() {
    if (loginSession) await cancelLogin();
    toggle();
  }

  async function copyUserCode() {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setAuthError('Unable to copy the verification code.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending || authStatus?.auth.status !== 'connected') return;
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

  const connected = authStatus?.auth.status === 'connected';
  const loginRunning = loginSession !== null;
  const providerLabel =
    authStatus?.provider === 'openai-codex' ? 'OpenAI Codex' : authStatus?.provider;

  return (
    <ResizablePanel id="copilot" defaultSize={320} minSize={280} maxSize={640} className="min-w-0">
      <aside className="h-full border-l border-[var(--border)] bg-[var(--surface-sidebar)] flex flex-col select-none">
        <div className="h-12 px-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-sm text-[var(--text-primary)]">
            <Sparkle size={15} className="text-[var(--accent-blue)]" weight="fill" />
            <span>Copilot Workspace</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void closeDrawer()}>
            <X size={15} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {authLoading && !authStatus && (
            <p className="text-sm text-[var(--text-muted)]">Checking provider connection...</p>
          )}
          {!authLoading && !authStatus && authError && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-app)] p-4 text-sm">
              <p className="text-red-600">{authError}</p>
              <Button className="mt-3" onClick={() => void refreshAuthStatus()}>
                Retry
              </Button>
            </div>
          )}
          {authStatus && !connected && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-app)] p-4 text-sm">
              <p className="font-semibold text-[var(--text-primary)]">{providerLabel}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{authStatus.model}</p>
              {authStatus.auth.status === 'unsupported' ? (
                <p className="mt-4 text-[var(--text-muted)]">
                  This provider does not support browser login.
                </p>
              ) : loginRunning ? (
                <div className="mt-4 space-y-3">
                  {deviceCode && (
                    <>
                      <p className="text-[var(--text-muted)]">
                        Open the verification page and enter this code
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-[var(--surface-hover)] px-2 py-2 text-center font-semibold tracking-wider text-[var(--text-primary)]">
                          {deviceCode.userCode}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void copyUserCode()}
                          aria-label="Copy verification code"
                        >
                          {copied ? <Check size={15} /> : <Copy size={15} />}
                        </Button>
                      </div>
                      <a
                        href={deviceCode.verificationUri}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-center text-[var(--accent-blue)] underline"
                      >
                        Open verification page
                      </a>
                    </>
                  )}
                  <p className="text-[var(--text-muted)]">
                    {authProgress || 'Waiting for authorization...'}
                  </p>
                  <Button variant="secondary" onClick={() => void cancelLogin()}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-[var(--text-muted)]">
                    Connect from this drawer. Your credentials stay on the Work Boost API server.
                  </p>
                  {authStatus.auth.status === 'refresh_failed' && (
                    <p className="text-amber-600">
                      The saved login could not be refreshed. Reconnect to continue.
                    </p>
                  )}
                  <Button onClick={() => void startLogin()} disabled={authLoading}>
                    {authStatus.auth.status === 'refresh_failed'
                      ? 'Reconnect OpenAI Codex'
                      : 'Connect OpenAI Codex'}
                  </Button>
                  {authError && <p className="text-red-600">{authError}</p>}
                </div>
              )}
            </div>
          )}

          {connected && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-app)] px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-[var(--text-primary)]">OpenAI Codex connected</p>
                <p className="text-[var(--text-muted)]">{authStatus?.model}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void logoutAuth()}
                disabled={authLoading}
              >
                Log out
              </Button>
            </div>
          )}
          {connected && messages.length === 0 && (
            <div className="text-center py-10 text-sm text-[var(--text-muted)] leading-relaxed">
              <Sparkle size={28} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium text-[var(--text-primary)] mb-2">
                How can I help you today?
              </p>
              <p>Summarize notes, query daily tasks, or record debt entries.</p>
            </div>
          )}
          {connected &&
            messages.map((item, index) => (
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
          {connected && sending && (
            <div className="text-sm text-[var(--text-muted)] flex items-center gap-1.5 italic">
              <Sparkle size={13} className="animate-spin" /> Thinking...
            </div>
          )}
          {connected && authError && <p className="text-sm text-red-600">{authError}</p>}
        </div>

        {connected && (
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
        )}
      </aside>
    </ResizablePanel>
  );
}
