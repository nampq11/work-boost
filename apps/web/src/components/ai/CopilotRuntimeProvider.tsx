import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api } from '../../lib/api-client.ts';
import { createCopilotAdapter } from './copilot-adapter.ts';

interface CopilotRuntimeContextValue {
  resetConversation: () => void;
}

const CopilotRuntimeContext = createContext<CopilotRuntimeContextValue | null>(null);

export function useCopilotRuntime(): CopilotRuntimeContextValue {
  const context = useContext(CopilotRuntimeContext);
  if (!context) throw new Error('useCopilotRuntime must be used inside CopilotRuntimeProvider');
  return context;
}

export function CopilotRuntimeProvider({ children }: React.PropsWithChildren) {
  const [threadId, setThreadId] = useState<Promise<string>>(() =>
    api.createThread().then((thread) => thread.id),
  );
  const adapter = useMemo(() => createCopilotAdapter(threadId), [threadId]);
  const runtime = useLocalRuntime(adapter);
  const resetConversation = useCallback(() => {
    runtime.thread.cancelRun();
    runtime.thread.reset();
    setThreadId(api.createThread().then((thread) => thread.id));
  }, [runtime]);
  const contextValue = useMemo(() => ({ resetConversation }), [resetConversation]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CopilotRuntimeContext.Provider value={contextValue}>
        {children}
      </CopilotRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  );
}
