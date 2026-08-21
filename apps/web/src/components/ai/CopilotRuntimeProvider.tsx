import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createCopilotAdapter } from './copilot-adapter.ts';

interface CopilotRuntimeContextValue {
  sessionId: string;
  resetConversation: () => void;
}

const CopilotRuntimeContext = createContext<CopilotRuntimeContextValue | null>(null);

function createSessionId(): string {
  return crypto.randomUUID();
}

export function useCopilotRuntime(): CopilotRuntimeContextValue {
  const context = useContext(CopilotRuntimeContext);
  if (!context) throw new Error('useCopilotRuntime must be used inside CopilotRuntimeProvider');
  return context;
}

export function CopilotRuntimeProvider({ children }: React.PropsWithChildren) {
  const [sessionId, setSessionId] = useState(createSessionId);
  const adapter = useMemo(() => createCopilotAdapter(sessionId), [sessionId]);
  const runtime = useLocalRuntime(adapter);
  const resetConversation = useCallback(() => {
    runtime.thread.cancelRun();
    runtime.thread.reset();
    setSessionId(createSessionId());
  }, [runtime]);
  const contextValue = useMemo(
    () => ({ sessionId, resetConversation }),
    [resetConversation, sessionId],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CopilotRuntimeContext.Provider value={contextValue}>
        {children}
      </CopilotRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  );
}
