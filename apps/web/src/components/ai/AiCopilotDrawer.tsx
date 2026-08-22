import { Sparkle, X } from '@phosphor-icons/react';
import React, { useEffect, useRef, useState } from 'react';
import {
  type AuthLoginEvent,
  type AuthLoginSession,
  type AuthStatus,
  api,
} from '../../lib/api-client.ts';
import { openExternalUrl } from '../../lib/external-url.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { Button } from '../ui/Button.tsx';
import { ResizablePanel } from '../ui/resizable.tsx';
import { CopilotAuthPanel } from './CopilotAuthPanel.tsx';
import { WorkBoostThread } from './WorkBoostThread.tsx';

export function AiCopilotDrawer() {
  const open = useUiStore((state) => state.copilotOpen);
  const toggle = useUiStore((state) => state.toggleCopilot);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginSession, setLoginSession] = useState<AuthLoginSession | null>(null);
  const [deviceCode, setDeviceCode] = useState<Extract<
    AuthLoginEvent,
    { type: 'device_code' }
  > | null>(null);
  const [authProgress, setAuthProgress] = useState('');
  const [authError, setAuthError] = useState('');
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
    } else if (event.type === 'auth_url') {
      // Browser-flow OAuth: hand the URL to the OS browser (Tauri opener) or a new tab (browser).
      setAuthProgress(event.instructions ?? 'Opening your browser to authorize...');
      void openExternalUrl(event.url).catch(() => setAuthError('Unable to open the browser.'));
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

  const isConnected = authStatus?.auth.status === 'connected';
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
          {isConnected ? (
            <WorkBoostThread />
          ) : (
            <CopilotAuthPanel
              authStatus={authStatus}
              authLoading={authLoading}
              authError={authError}
              loginSession={loginSession}
              deviceCode={deviceCode}
              authProgress={authProgress}
              onRetry={() => void refreshAuthStatus()}
              onStartLogin={() => void startLogin()}
              onCancelLogin={() => void cancelLogin()}
              onError={setAuthError}
            />
          )}
        </div>
      </aside>
    </ResizablePanel>
  );
}
