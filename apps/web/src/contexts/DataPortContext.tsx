import React, { createContext, useContext } from 'react';
import type { DataPort } from '../lib/data-port.ts';

const DataPortContext = createContext<DataPort | null>(null);

interface DataPortProviderProps {
  port: DataPort;
  children: React.ReactNode;
}

export function DataPortProvider({ port, children }: DataPortProviderProps) {
  return <DataPortContext.Provider value={port}>{children}</DataPortContext.Provider>;
}

export function useDataPort(): DataPort {
  const port = useContext(DataPortContext);
  if (!port) {
    throw new Error('useDataPort must be used within a DataPortProvider');
  }
  return port;
}
