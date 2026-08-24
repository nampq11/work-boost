import React, { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { CopilotRuntimeProvider } from './components/ai/CopilotRuntimeProvider.tsx';
import { resolveApiBase } from './lib/api-base.ts';
import { I18nProvider, useI18n } from './lib/i18n.tsx';
import './index.css';
import 'streamdown/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Work Boost root element is missing');

function Root() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveApiBase().then(
      () => {
        if (active) setReady(true);
      },
      // resolveApiBase rejects in Tauri when get_api_base fails (e.g. sidecar crash);
      // without this handler the app would sit on "Connecting..." forever.
      (err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>{t('app.failedToConnect')}</p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        {t('app.connecting')}
      </div>
    );
  }

  return (
    <CopilotRuntimeProvider>
      <App />
    </CopilotRuntimeProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider defaultLocale="en">
      <Root />
    </I18nProvider>
  </StrictMode>,
);
