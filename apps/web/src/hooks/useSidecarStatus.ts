import { useEffect, useState } from 'react';
import { useDataPort } from '../contexts/DataPortContext.tsx';
import type { SidecarStatus } from '../lib/data-port.ts';

/**
 * Subscribe to the current DataPort's sidecar status. Re-renders on transitions
 * (starting -> ready / failed, failed -> starting after a retry).
 */
export function useSidecarStatus(): SidecarStatus {
  const port = useDataPort();
  const [status, setStatus] = useState<SidecarStatus>(() => port.getSidecarStatus());
  useEffect(() => port.onSidecarStatusChange(setStatus), [port]);
  return status;
}
