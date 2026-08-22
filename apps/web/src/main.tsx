import React, { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { resolveApiBase } from './lib/api-base.ts';
import { CopilotRuntimeProvider } from './components/ai/CopilotRuntimeProvider.tsx';
import './index.css';
import 'streamdown/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Work Boost root element is missing');

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    resolveApiBase().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Connecting to workspace...
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
    <Root />
  </StrictMode>,
);
