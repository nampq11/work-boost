import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { CopilotRuntimeProvider } from './components/ai/CopilotRuntimeProvider.tsx';
import './index.css';
import 'streamdown/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Work Boost root element is missing');
createRoot(root).render(
  <StrictMode>
    <CopilotRuntimeProvider>
      <App />
    </CopilotRuntimeProvider>
  </StrictMode>,
);
