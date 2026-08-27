import React, { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { CopilotRuntimeProvider } from './components/ai/CopilotRuntimeProvider.tsx';
import { DataPortProvider } from './contexts/DataPortContext.tsx';
import { resolveApiBase } from './lib/api-base.ts';
import type { DataPort } from './lib/data-port.ts';
import { HttpDataPort } from './lib/http-data-port.ts';
import { I18nProvider, useI18n } from './lib/i18n.tsx';
import { TauriDataPort } from './lib/tauri-data-port.ts';
import { isTauri } from './lib/tauri.ts';
import { WorkspaceStoreProvider } from './store/workspace-store.ts';
import './index.css';
import 'streamdown/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Work Boost root element is missing');

/**
 * Detect a bundled Tauri build. Bundled builds load the webview from a custom
 * protocol (`tauri://` or `https://tauri.localhost/`), while `tauri dev` loads
 * from `http://localhost:1420/`. Used to select TauriDataPort over HttpDataPort.
 */
function isCustomProtocol(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'tauri:' || window.location.hostname === 'tauri.localhost';
}

/**
 * Select the DataPort implementation for the current environment:
 * - Bundled Tauri build: TauriDataPort (IPC for FS, HTTP for AI when sidecar ready)
 * - Dev Tauri build: HttpDataPort resolved to the dev API on port 3001
 * - Browser: HttpDataPort with default base
 */
async function createDataPort(): Promise<DataPort> {
  if (isTauri() && isCustomProtocol()) {
    // Bundled build: TauriDataPort for FS, sidecar for AI when ready.
    const port = new TauriDataPort();
    await port.init();
    return port;
  }
  if (isTauri()) {
    // Dev build: HttpDataPort pointing at port 3001 (existing behavior)
    await resolveApiBase();
    return new HttpDataPort();
  }
  // Browser: HttpDataPort with default base (existing behavior)
  return new HttpDataPort();
}

function Root() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState<DataPort | null>(null);

  useEffect(() => {
    let active = true;
    createDataPort().then(
      (createdPort) => {
        if (!active) return;
        setPort(createdPort);
        setReady(true);
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

  if (!ready || !port) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        {t('app.connecting')}
      </div>
    );
  }

  return (
    <DataPortProvider port={port}>
      <WorkspaceStoreProvider port={port}>
        <CopilotRuntimeProvider>
          <App />
        </CopilotRuntimeProvider>
      </WorkspaceStoreProvider>
    </DataPortProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider defaultLocale="en">
      <Root />
    </I18nProvider>
  </StrictMode>,
);
