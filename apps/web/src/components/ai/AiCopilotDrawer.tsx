import { Sparkle, X } from '@phosphor-icons/react';
import { Button, ResizablePanel } from '@work-boost/ui';
import React, { useEffect, useRef, useState } from 'react';
import {
  type AuthLoginEvent,
  type AuthLoginSession,
  type AuthStatus,
  api,
} from '../../lib/api-client.ts';
import { openExternalUrl } from '../../lib/external-url.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { isTauri } from '../../lib/tauri.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { CopilotAuthPanel } from './CopilotAuthPanel.tsx';
import { WorkBoostThread } from './WorkBoostThread.tsx';

export function AiCopilotDrawer() {
  const { t } = useI18n();
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
  const [authUrl, setAuthUrl] = useState<string | null>(null);
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
        setAuthError(
          error instanceof Error ? error.message : t('copilot.auth.providerUnavailable'),
        );
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
      setAuthProgress(t('copilot.auth.waitingForAuthorization'));
    } else if (event.type === 'auth_url') {
      // Browser-flow OAuth: in Tauri, auto-open via opener plugin. In browser,
      // show a clickable link since window.open without user activation is blocked.
      setAuthProgress(event.instructions ?? t('copilot.auth.openLinkBelow'));
      // Only expose http(s) URLs: the event arrives over SSE, and a javascript:/custom-scheme
      // value must never reach an anchor href or the OS opener.
      if (/^https?:\/\//i.test(event.url)) {
        setAuthUrl(event.url);
        // Auto-open in Tauri only; browsers block window.open without user activation,
        // so the panel renders a clickable link instead.
        if (isTauri()) {
          void openExternalUrl(event.url).catch(() =>
            setAuthError(t('copilot.auth.unableOpenBrowser')),
          );
        }
      } else {
        console.error('Ignoring non-http auth_url event:', event.url);
      }
    } else if (event.type === 'progress') {
      setAuthProgress(event.message);
    } else if (event.type === 'completed') {
      clearLoginSession();
      setDeviceCode(null);
      setAuthError('');
      setAuthUrl(null);
      void refreshAuthStatus();
    } else if (event.type === 'failed') {
      clearLoginSession();
      setAuthError(event.message);
      setAuthUrl(null);
      void refreshAuthStatus();
    } else if (event.type === 'cancelled') {
      clearLoginSession();
      setAuthError(t('copilot.auth.loginCancelled'));
      setAuthUrl(null);
      void refreshAuthStatus();
    }
  }

  async function startLogin() {
    if (authLoading || loginSession) return;
    const requestId = ++loginRequestRef.current;
    setAuthLoading(true);
    setAuthError('');
    setDeviceCode(null);
    setAuthProgress(t('copilot.auth.startingLogin'));
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
        setAuthError(t('copilot.auth.progressInterrupted'));
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t('copilot.auth.providerUnavailable'));
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
      setAuthError(error instanceof Error ? error.message : t('copilot.auth.unableCancelLogin'));
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
            <span>{t('copilot.workspace')}</span>
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
              authUrl={authUrl}
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
