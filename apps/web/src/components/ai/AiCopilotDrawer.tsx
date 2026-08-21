import { Check, Copy, Sparkle, X } from '@phosphor-icons/react';
import React, { useEffect, useRef, useState } from 'react';
import {
  type AuthLoginEvent,
  type AuthLoginSession,
  type AuthStatus,
  api,
} from '../../lib/api-client.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { Button } from '../ui/Button.tsx';
import { ResizablePanel } from '../ui/resizable.tsx';
import { useCopilotRuntime } from './CopilotRuntimeProvider.tsx';
import { WorkBoostThread } from './WorkBoostThread.tsx';

export function AiCopilotDrawer() {
  const open = useUiStore((state) => state.copilotOpen);
  const toggle = useUiStore((state) => state.toggleCopilot);
  const { resetConversation } = useCopilotRuntime();
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
      resetConversation();
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

  const connected = authStatus?.auth.status === 'connected';
  const loginRunning = loginSession !== null;
  const providerLabel =
    authStatus?.provider === 'openai-codex' ? 'OpenAI Codex' : authStatus?.provider;

  return (
    <ResizablePanel id="copilot" defaultSize={320} minSize={280} maxSize={640} className="min-w-0">
      <aside className="flex h-full select-none flex-col border-l border-[var(--border)] bg-[var(--surface-sidebar)]">
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-3.5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <Sparkle size={15} className="text-[var(--accent-blue)]" weight="fill" />
            <span>Copilot Workspace</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void closeDrawer()}>
            <X size={15} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {connected && (
            <div className="flex-none px-4 pt-4">
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
              {authError && <p className="mt-2 text-sm text-red-600">{authError}</p>}
            </div>
          )}

          {connected ? (
            <WorkBoostThread />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
              {authStatus && (
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
                        Connect from this drawer. Your credentials stay on the Work Boost API
                        server.
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
            </div>
          )}
        </div>
      </aside>
    </ResizablePanel>
  );
}
