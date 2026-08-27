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

  const create = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    // Create lazily once the sidecar is reachable. A failure (sidecar went down
    // between status check and request) leaves the thread null; the effect retries
    // on the next status/thread change. The rejection is consumed here so it never
    // becomes an unhandled promise rejection.
    const pending = port.createThread().then((thread) => {
      creatingRef.current = false;
      return thread.id;
    });
    void pending.catch(() => {
      creatingRef.current = false;
      setThreadId(null);
    });
    setThreadId(pending as Promise<string>);
  }, [port]);

  // Create the thread as soon as the sidecar is available.
  const ready = sidecarStatus === 'ready' || sidecarStatus === 'browser';
  useEffect(() => {
    if (ready && threadId === null) create();
  }, [ready, threadId, create]);

  const reset = useCallback(() => {
    setThreadId(null);
    creatingRef.current = false;
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
