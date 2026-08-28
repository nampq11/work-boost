import { Check, Copy, Key } from '@phosphor-icons/react';
import type { AuthMethod } from '@work-boost/data-schemas/auth';
import { Button } from '@work-boost/ui';
import React, { useEffect, useRef, useState } from 'react';
import type { AuthLoginEvent, AuthLoginSession, AuthStatus } from '../../lib/api-client.ts';
import { useI18n } from '../../lib/i18n.tsx';

export interface CopilotAuthPanelProps {
  authStatus: AuthStatus | null;
  authLoading: boolean;
  authError: string;
  loginSession: AuthLoginSession | null;
  deviceCode: Extract<AuthLoginEvent, { type: 'device_code' }> | null;
  authProgress: string;
  authUrl: string | null;
  onRetry: () => void;
  onStartLogin: (provider: string, model?: string) => void;
  onCancelLogin: () => void;
  onSaveApiKey: (provider: string, apiKey: string, model?: string) => void;
  onError: (message: string) => void;
}

function getAuthMethodLabel(method: AuthMethod): string {
  return method === 'oauth' ? 'OAuth' : 'API key';
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
  onSaveApiKey,
  onError,
}: CopilotAuthPanelProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [modelValue, setModelValue] = useState('');
  const [useApiKeyMode, setUseApiKeyMode] = useState(false);
  const copyTimeoutRef = useRef<number | undefined>(undefined);

  // Determine the effective selected provider.
  const providers = authStatus?.providers ?? [];
  const activeProviderId = authStatus?.provider ?? '';
  const selectedProvider = selectedProviderId ?? activeProviderId;
  const isActiveSelected = selectedProvider === activeProviderId;
  const selectedDescriptor = providers.find((p) => p.id === selectedProvider);
  const selectedProviderName = selectedDescriptor?.name ?? selectedProvider;
  const supportsOAuth = selectedDescriptor?.methods.includes('oauth') ?? false;
  const supportsApiKey = selectedDescriptor?.methods.includes('api_key') ?? false;
  // Only show API key as primary when the provider has no OAuth.
  const showApiKeyPrimary = !supportsOAuth && supportsApiKey;
  const showOAuthPrimary = supportsOAuth && !useApiKeyMode;
  const showModelInput = selectedDescriptor?.requiresModel ?? false;
  const modelValid = !showModelInput || modelValue.trim().length > 0;

  async function copyUserCode() {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopied(true);
      window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onError(t('copilot.auth.unableCopyCode'));
    }
  }

  function handleConnect() {
    const model = showModelInput ? modelValue.trim() || undefined : undefined;
    onStartLogin(selectedProvider, model);
  }

  function handleApiKeyConnect() {
    const key = apiKeyValue.trim();
    if (!key) {
      onError(t('copilot.auth.apiKeyRequired'));
      return;
    }
    const model = showModelInput ? modelValue.trim() || undefined : undefined;
    onSaveApiKey(selectedProvider, key, model);
  }

  // Reset the auth form whenever the provider being edited changes.
  useEffect(() => {
    setApiKeyValue('');
    setModelValue('');
    setUseApiKeyMode(false);
  }, [selectedProvider]);

  useEffect(() => () => window.clearTimeout(copyTimeoutRef.current), []);

  const activeDescriptor = providers.find((p) => p.id === authStatus?.provider);
  const providerLabel = activeDescriptor?.name ?? authStatus?.provider ?? '';

  return (
    <div className="p-4">
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
        <div className="flex flex-col gap-4">
          {/* Provider selector */}
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t('copilot.auth.provider')}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {t('copilot.auth.providerHint')}
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {providers.map((provider) => {
                const isSelected = provider.id === selectedProvider;
                const isActive = provider.id === activeProviderId;
                return (
                  <button
                    key={provider.id}
                    onClick={() => setSelectedProviderId(provider.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? 'border-[var(--accent-blue)] bg-[var(--surface-hover)]'
                        : 'border-[var(--border)] bg-[var(--surface-app)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--text-primary)] font-medium">
                        {provider.name}
                      </span>
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        {provider.methods.map(getAuthMethodLabel).join(' / ')}
                      </span>
                      {isActive && (
                        <span className="ml-2 text-xs text-[var(--accent-blue)]">
                          {t('copilot.auth.active')}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check
                        size={14}
                        className="text-[var(--accent-blue)] shrink-0"
                        weight="bold"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connection section for the selected provider */}
          {isActiveSelected && loginSession ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-app)] p-4 text-sm">
              <p className="font-semibold text-[var(--text-primary)]">{providerLabel}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{authStatus.model}</p>
              <div className="mt-4 flex flex-col gap-3">
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
                    className="mt-2 block text-center text-[var(--accent-blue)] underline"
                  >
                    {t('copilot.auth.openAuthorizationLink')}
                  </a>
                )}
                <Button variant="secondary" onClick={onCancelLogin}>
                  {t('copilot.auth.cancel')}
                </Button>
              </div>
            </div>
          ) : isActiveSelected && authStatus.auth.status === 'connected' ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-app)] p-4 text-sm">
              <p className="font-semibold text-[var(--text-primary)]">{providerLabel}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{authStatus.model}</p>
              <p className="mt-3 text-[var(--accent-green)]">{t('copilot.auth.connected')}</p>
              {authStatus.auth.source && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">{authStatus.auth.source}</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-app)] p-4 text-sm">
              <p className="font-semibold text-[var(--text-primary)]">{selectedProviderName}</p>

              {/* Model input (for openrouter and similar providers) */}
              {showModelInput && (
                <div className="mt-3">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">
                    {t('copilot.auth.model')}
                  </label>
                  <input
                    type="text"
                    value={modelValue}
                    onChange={(e) => setModelValue(e.target.value)}
                    placeholder={t('copilot.auth.modelPlaceholder')}
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-app)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('copilot.auth.modelHint')}
                  </p>
                </div>
              )}

              {/* OAuth connect */}
              {showOAuthPrimary && (
                <div className="mt-4 flex flex-col gap-3">
                  {authStatus.auth.status === 'refresh_failed' && (
                    <p className="text-amber-600">{t('copilot.auth.refreshFailed')}</p>
                  )}
                  <Button onClick={handleConnect} disabled={authLoading || !modelValid}>
                    {isActiveSelected
                      ? authStatus.auth.status === 'refresh_failed'
                        ? t('copilot.auth.reconnect')
                        : t('copilot.auth.connect')
                      : t('copilot.auth.connectWith', { name: selectedProviderName })}
                  </Button>
                  {supportsApiKey && (
                    <button
                      onClick={() => setUseApiKeyMode(true)}
                      className="mt-1 text-xs text-[var(--accent-blue)] underline"
                    >
                      {t('copilot.auth.useApiKeyInstead')}
                    </button>
                  )}
                </div>
              )}

              {/* API key entry */}
              {(showApiKeyPrimary || (!showOAuthPrimary && supportsApiKey && useApiKeyMode)) && (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface-app)] px-2.5 py-1.5">
                    <Key size={14} className="text-[var(--text-muted)] shrink-0" />
                    <input
                      type="password"
                      value={apiKeyValue}
                      onChange={(e) => setApiKeyValue(e.target.value)}
                      placeholder={t('copilot.auth.apiKeyPlaceholder')}
                      className="flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none"
                    />
                  </div>
                  <Button
                    onClick={handleApiKeyConnect}
                    disabled={authLoading || !apiKeyValue.trim() || !modelValid}
                  >
                    {isActiveSelected
                      ? t('copilot.auth.connectApiKey')
                      : t('copilot.auth.connectApiKeyWith', { name: selectedProviderName })}
                  </Button>
                  {supportsOAuth && (
                    <button
                      onClick={() => setUseApiKeyMode(false)}
                      className="mt-1 text-xs text-[var(--accent-blue)] underline"
                    >
                      {t('copilot.auth.useOAuthInstead')}
                    </button>
                  )}
                </div>
              )}

              {/* Provider has no supported auth methods */}
              {!supportsOAuth && !supportsApiKey && (
                <p className="mt-4 text-[var(--text-muted)]">
                  {t('copilot.auth.noSupportedMethods')}
                </p>
              )}
            </div>
          )}

          {authError && <p className="text-sm text-red-600">{authError}</p>}
        </div>
      )}
    </div>
  );
}
