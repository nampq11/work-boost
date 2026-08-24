import { Check, Copy } from '@phosphor-icons/react';
import { Button } from '@work-boost/ui';
import React, { useState } from 'react';
import type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '../../lib/api-client.ts';
import { useI18n } from '../../lib/i18n.tsx';

interface CopilotAuthPanelProps {
  authStatus: AuthStatus | null;
  authLoading: boolean;
  authError: string;
  loginSession: AuthLoginSession | null;
  deviceCode: Extract<AuthLoginEvent, { type: 'device_code' }> | null;
  authProgress: string;
  authUrl: string | null;
  onRetry: () => void;
  onStartLogin: () => void;
  onCancelLogin: () => void;
  onError: (message: string) => void;
}

export function CopilotAuthPanel({
  authStatus,
  authLoading,
  authError,
  loginSession,
  deviceCode,
  authProgress,
  authUrl,
  onRetry,
  onStartLogin,
  onCancelLogin,
  onError,
}: CopilotAuthPanelProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const providerLabel =
    authStatus?.provider === 'openai-codex' ? 'OpenAI Codex' : authStatus?.provider;

  async function copyUserCode() {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onError(t('copilot.auth.unableCopyCode'));
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {authLoading && !authStatus && (
        <p className="text-sm text-[var(--text-muted)]">{t('copilot.auth.checkingConnection')}</p>
      )}
      {!authLoading && !authStatus && authError && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-app)] p-4 text-sm">
          <p className="text-red-600">{authError}</p>
          <Button className="mt-3" onClick={onRetry}>
            {t('copilot.auth.retry')}
          </Button>
        </div>
      )}
      {authStatus && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-app)] p-4 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">{providerLabel}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{authStatus.model}</p>
          {authStatus.auth.status === 'unsupported' ? (
            <p className="mt-4 text-[var(--text-muted)]">{t('copilot.auth.noBrowserLogin')}</p>
          ) : loginSession ? (
            <div className="mt-4 space-y-3">
              {deviceCode && (
                <>
                  <p className="text-[var(--text-muted)]">
                    {t('copilot.auth.openVerificationPage')}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-[var(--surface-hover)] px-2 py-2 text-center font-semibold tracking-wider text-[var(--text-primary)]">
                      {deviceCode.userCode}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void copyUserCode()}
                      aria-label={t('auth.copyVerificationCode')}
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
                    {t('copilot.auth.openVerificationPageLink')}
                  </a>
                </>
              )}
              <p className="text-[var(--text-muted)]">
                {authProgress || t('copilot.auth.waitingForAuthorization')}
              </p>
              {authUrl && (
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block mt-2 text-center text-[var(--accent-blue)] underline"
                >
                  {t('copilot.auth.openAuthorizationLink')}
                </a>
              )}
              <Button variant="secondary" onClick={onCancelLogin}>
                {t('copilot.auth.cancel')}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-[var(--text-muted)]">{t('copilot.auth.connectFromDrawer')}</p>
              {authStatus.auth.status === 'refresh_failed' && (
                <p className="text-amber-600">{t('copilot.auth.refreshFailed')}</p>
              )}
              <Button onClick={onStartLogin} disabled={authLoading}>
                {authStatus.auth.status === 'refresh_failed'
                  ? t('copilot.auth.reconnectOpenAICodex')
                  : t('copilot.auth.connectOpenAICodex')}
              </Button>
            </div>
          )}
          {authError && <p className="mt-3 text-red-600">{authError}</p>}
        </div>
      )}
    </div>
  );
}
