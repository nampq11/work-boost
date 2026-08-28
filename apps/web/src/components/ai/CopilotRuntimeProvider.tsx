import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDataPort } from '../../contexts/DataPortContext.tsx';
import { useSidecarStatus } from '../../hooks/useSidecarStatus.ts';
import { createCopilotAdapter, dataPortToCopilotClient } from './copilot-adapter.ts';

interface CopilotRuntimeContextValue {
  resetConversation: () => void;
}

const CopilotRuntimeContext = createContext<CopilotRuntimeContextValue | null>(null);

export function useCopilotRuntime(): CopilotRuntimeContextValue {
  const context = useContext(CopilotRuntimeContext);
  if (!context) throw new Error('useCopilotRuntime must be used inside CopilotRuntimeProvider');
  return context;
}

/**
 * A deferred thread id. When the AI sidecar is starting/failed, `createThread`
 * throws, so the thread is created lazily once the sidecar is ready. Until then
 * the adapter's run() rejects with the typed unavailable error and the drawer
 * shows the graceful "AI starting..." / "unavailable" state.
 */
function useThreadId(): [Promise<string> | null, () => void] {
  const port = useDataPort();
  const sidecarStatus = useSidecarStatus();
  const [threadId, setThreadId] = useState<Promise<string> | null>(null);
  const creatingRef = useRef(false);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const create = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    // Create lazily once the sidecar is reachable. A failure (sidecar went down
    // between status check and request) is retried with exponential backoff so a
    // sidecar that reports ready but rejects requests (e.g. 5xx) cannot produce
    // a tight create/reject loop. The rejection is consumed here so it never
    // becomes an unhandled promise rejection.
    const pending = port.createThread().then((thread): string => {
      attemptRef.current = 0;
      // Clear the in-flight guard on success too. It is only reset on failure
      // today, so after the first thread is created a "new chat" reset would see
      // a stale flag and never make a fresh thread, leaving the session null.
      creatingRef.current = false;
      return thread.id;
    });
    void pending.catch(() => {
      creatingRef.current = false;
      const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000);
      attemptRef.current += 1;
      setThreadId(null);
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined;
        // Skip the retry while the sidecar is down; the effect below re-creates
        // the thread as soon as it becomes ready again.
        const status = port.getSidecarStatus();
        if (status === 'ready' || status === 'browser') create();
      }, delay);
    });
    setThreadId(pending);
  }, [port]);

  // Create the thread as soon as the sidecar is available, unless a backed-off
  // retry is already scheduled (the timer owns the next attempt).
  const ready = sidecarStatus === 'ready' || sidecarStatus === 'browser';
  useEffect(() => {
    if (ready && threadId === null && retryTimerRef.current === undefined) create();
  }, [ready, threadId, create]);

  const reset = useCallback(() => {
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = undefined;
    attemptRef.current = 0;
    setThreadId(null);
    create();
  }, [create]);

  return [threadId, reset];
}

export function CopilotRuntimeProvider({ children }: React.PropsWithChildren) {
  const port = useDataPort();
  const [threadId, resetThread] = useThreadId();
  const client = useMemo(() => dataPortToCopilotClient(port), [port]);
  const adapter = useMemo(() => createCopilotAdapter(threadId, client), [threadId, client]);
  const runtime = useLocalRuntime(adapter);
  const resetConversation = useCallback(() => {
    runtime.thread.cancelRun();
    runtime.thread.reset();
    resetThread();
  }, [runtime, resetThread]);
  const contextValue = useMemo(() => ({ resetConversation }), [resetConversation]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CopilotRuntimeContext.Provider value={contextValue}>
        {children}
      </CopilotRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  );
}
