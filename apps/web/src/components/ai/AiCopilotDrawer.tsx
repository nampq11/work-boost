import { Plug, Plus, Sparkle, X } from '@phosphor-icons/react';
import type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '@work-boost/data-schemas/auth';
import { Button, ResizablePanel, usePanelRef } from '@work-boost/ui';
import React, { useEffect, useRef, useState } from 'react';
import { useDataPort } from '../../contexts/DataPortContext.tsx';
import { useSidecarStatus } from '../../hooks/useSidecarStatus.ts';
import { openExternalUrl } from '../../lib/external-url.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { isTauri } from '../../lib/tauri.ts';
import { useUiStore } from '../../store/ui-store.ts';
import { CopilotAuthDialog } from './CopilotAuthDialog.tsx';
import { useCopilotRuntime } from './CopilotRuntimeProvider.tsx';
import { WorkBoostThread } from './WorkBoostThread.tsx';

export function AiCopilotDrawer() {
  const { t } = useI18n();
  const port = useDataPort();
  const { resetConversation } = useCopilotRuntime();
  const sidecarStatus = useSidecarStatus();
  const open = useUiStore((state) => state.copilotOpen);
  const panelRef = usePanelRef();
  const lastWidthRef = useRef(320);

  const toggle = useUiStore((state) => state.toggleCopilot);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginSession, setLoginSession] = useState<AuthLoginSession | null>(null);
  const [deviceCode, setDeviceCode] = useState<Extract<
    AuthLoginEvent,
    { type: 'device_code' }
  > | null>(null);
  const [manualCodePrompt, setManualCodePrompt] = useState<Extract<
    AuthLoginEvent,
    { type: 'manual_code' }
  > | null>(null);
  const [authProgress, setAuthProgress] = useState('');
  const [authError, setAuthError] = useState('');
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const codeSubmittingRef = useRef(false);
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
      const status = await port.getAuthStatus();
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
      if (session) void port.cancelAuthLogin(session.loginId).catch(() => undefined);
    };
  }, [open]);

  // The auth status is only meaningful once the sidecar is reachable. When the
  // drawer is open and the sidecar transitions starting -> ready, fetch it so
  // the panel does not sit on a blank state.
  const sidecarReady = sidecarStatus === 'ready' || sidecarStatus === 'browser';
  useEffect(() => {
    if (!open || !sidecarReady) return;
    void refreshAuthStatus();
  }, [open, sidecarReady]);

  // The panel stays mounted and collapses instead of unmounting, so the
  // panel set never changes and sibling sizes (e.g. a widened sidebar)
  // survive toggling the drawer. expand() alone can fall back to minSize
  // because the internally remembered size is not always captured across a
  // reload, so re-apply the last user-visible width explicitly.
  useEffect(() => {
    if (open) {
      panelRef.current?.expand();
      panelRef.current?.resize(lastWidthRef.current);
    } else {
      panelRef.current?.collapse();
    }
  }, [open, panelRef]);

  function handleAuthEvent(event: AuthLoginEvent) {
    if (event.type === 'device_code') {
      setDeviceCode(event);
      setAuthProgress(t('copilot.auth.waitingForAuthorization'));
      // Auto-open the verification page in Tauri, mirroring the auth_url flow. In
      // a browser we keep it manual: window.open without a user gesture is blocked.
      if (isTauri() && /^https?:\/\//i.test(event.verificationUri)) {
        void openExternalUrl(event.verificationUri).catch(() =>
          setAuthError(t('copilot.auth.unableOpenBrowser')),
        );
      }
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
    } else if (event.type === 'manual_code') {
      setManualCodePrompt(event);
    } else if (event.type === 'completed') {
      clearLoginSession();
      setDeviceCode(null);
      setManualCodePrompt(null);
      setAuthError('');
      setAuthUrl(null);
      void refreshAuthStatus();
    } else if (event.type === 'failed') {
      clearLoginSession();
      setAuthError(event.message);
      setAuthUrl(null);
      setManualCodePrompt(null);
      void refreshAuthStatus();
    } else if (event.type === 'cancelled') {
      clearLoginSession();
      setAuthError(t('copilot.auth.loginCancelled'));
      setAuthUrl(null);
      setManualCodePrompt(null);
      void refreshAuthStatus();
    }
  }

  /**
   * Start an OAuth login for the given provider. Switches the active provider
   * first if the provider is not already active.
   */
  async function handleStartLogin(provider: string, model?: string) {
    if (authLoading || loginSession) return;
    const requestId = ++loginRequestRef.current;
    setAuthLoading(true);
    setAuthError('');
    setDeviceCode(null);
    setManualCodePrompt(null);
    setAuthProgress('');
    try {
      // Switch the active provider when it differs from the selection, or
      // persist an explicitly typed model even when the provider is already
      // active; otherwise the typed model would be silently dropped.
      if (provider !== authStatus?.provider || model !== undefined) {
        const status = await port.setAIConfig(provider, model);
        if (requestId !== loginRequestRef.current) return;
        setAuthStatus(status);
        // The provider is already connected; no login needed.
        if (status.auth.status === 'connected') return;
      }
      setAuthProgress(t('copilot.auth.startingLogin'));
      const session = await port.startAuthLogin(
        provider,
        authStatus?.auth.status === 'refresh_failed',
      );
      if (requestId !== loginRequestRef.current) {
        void port.cancelAuthLogin(session.loginId).catch(() => undefined);
        return;
      }
      clearLoginSession();
      loginSessionRef.current = session;
      setLoginSession(session);
      unsubscribeRef.current = port.subscribeAuthLogin(session.loginId, handleAuthEvent, () => {
        setAuthError(t('copilot.auth.progressInterrupted'));
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t('copilot.auth.providerUnavailable'));
    } finally {
      setAuthLoading(false);
    }
  }

  /**
   * Store an API key for a provider. Switches the active provider first if the
   * provider is not already active.
   */
  async function handleSaveApiKey(provider: string, apiKey: string, model?: string) {
    setAuthLoading(true);
    setAuthError('');
    try {
      if (provider !== authStatus?.provider || model !== undefined) {
        const status = await port.setAIConfig(provider, model);
        setAuthStatus(status);
      }
      await port.saveApiKey(provider, apiKey);
      await refreshAuthStatus();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t('copilot.auth.unableSaveApiKey'));
    } finally {
      setAuthLoading(false);
    }
  }

  async function cancelLogin() {
    const session = loginSession;
    if (!session) return;
    clearLoginSession();
    setDeviceCode(null);
    setManualCodePrompt(null);
    setAuthProgress('');
    try {
      await port.cancelAuthLogin(session.loginId);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t('copilot.auth.unableCancelLogin'));
    }
    await refreshAuthStatus();
  }

  async function submitLoginCode(code: string) {
    const session = loginSessionRef.current;
    // A second submit while one is in flight would hit the server's 409
    // AUTH_NO_CODE_PROMPT; the ref guard also covers clicks that land before
    // React re-renders the disabled button.
    if (!session || codeSubmittingRef.current) return;
    codeSubmittingRef.current = true;
    setCodeSubmitting(true);
    const requestId = loginRequestRef.current;
    setAuthError('');
    try {
      // Keep the prompt visible until a terminal event arrives; the login may
      // still be racing the loopback callback, which can complete independently.
      await port.submitLoginCode(session.loginId, code);
      setManualCodePrompt(null);
    } catch (error) {
      // Ignore a rejection when the login has already settled (e.g. the loopback
      // callback won the race): the terminal event clears the prompt and state.
      if (requestId === loginRequestRef.current && loginSessionRef.current === session) {
        setAuthError(error instanceof Error ? error.message : t('copilot.auth.unableSubmitCode'));
      }
    } finally {
      codeSubmittingRef.current = false;
      setCodeSubmitting(false);
    }
  }

  async function closeDrawer() {
    if (loginSession) await cancelLogin();
    toggle();
  }

  const isConnected = authStatus?.auth.status === 'connected';

  function handleAuthDialogChange(next: boolean) {
    setAuthDialogOpen(next);
    if (!next && loginSession) void cancelLogin();
  }

  // The connection dialog is a transient setup step; dismiss it once connected.
  useEffect(() => {
    if (isConnected) setAuthDialogOpen(false);
  }, [isConnected]);
  return (
    <ResizablePanel
      id="copilot"
      panelRef={panelRef}
      collapsible
      collapsedSize={0}
      defaultSize={320}
      minSize={280}
      maxSize={640}
      onResize={(size) => {
        if (size.inPixels > 0) lastWidthRef.current = size.inPixels;
      }}
      className="min-w-0"
    >
      {open && (
        <>
          <aside className="flex h-full select-none flex-col border-l border-[var(--border)] bg-[var(--surface-sidebar)]">
            <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-3.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                <Sparkle size={15} className="text-[var(--accent-blue)]" weight="fill" />
                <span>{t('copilot.workspace')}</span>
              </div>
              <div className="flex items-center gap-1">
                {isConnected && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void resetConversation()}
                    aria-label={t('thread.newChat')}
                    title={t('thread.newChat')}
                  >
                    <Plus size={15} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAuthDialogOpen(true)}
                  aria-label={t('copilot.auth.connection')}
                >
                  <Plug size={15} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void closeDrawer()}>
                  <X size={15} />
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {sidecarStatus === 'starting' ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-[var(--text-muted)]">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-blue)]" />
                  <p>{t('copilot.sidecar.starting')}</p>
                </div>
              ) : sidecarStatus === 'failed' ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm">
                  <p className="text-[var(--text-primary)]">{t('copilot.sidecar.unavailable')}</p>
                  <Button
                    variant="secondary"
                    onClick={() => void port.retrySidecar?.()}
                    className="mt-1"
                  >
                    {t('copilot.sidecar.retry')}
                  </Button>
                </div>
              ) : isConnected ? (
                <WorkBoostThread />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                  <Sparkle size={32} className="text-[var(--accent-blue)]" weight="fill" />
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('copilot.auth.notConnected')}
                  </p>
                  <Button variant="secondary" onClick={() => setAuthDialogOpen(true)}>
                    {t('copilot.auth.connect')}
                  </Button>
                </div>
              )}
            </div>
          </aside>
          <CopilotAuthDialog
            open={authDialogOpen}
            onOpenChange={handleAuthDialogChange}
            authStatus={authStatus}
            authLoading={authLoading}
            authError={authError}
            loginSession={loginSession}
            deviceCode={deviceCode}
            manualCodePrompt={manualCodePrompt}
            authProgress={authProgress}
            authUrl={authUrl}
            submittingCode={codeSubmitting}
            onRetry={() => void refreshAuthStatus()}
            onStartLogin={(provider, model) => void handleStartLogin(provider, model)}
            onSaveApiKey={(provider, apiKey, model) =>
              void handleSaveApiKey(provider, apiKey, model)
            }
            onCancelLogin={() => void cancelLogin()}
            onSubmitCode={(code) => void submitLoginCode(code)}
            onOpenExternal={(url) =>
              void openExternalUrl(url).catch(() =>
                setAuthError(t('copilot.auth.unableOpenBrowser')),
              )
            }
            onError={setAuthError}
          />
        </>
      )}
    </ResizablePanel>
  );
}
