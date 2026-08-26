import { create } from 'zustand';

export interface UpdateInfo {
  version: string;
}

// Check errors are swallowed by Rust as `null` and never become `error`; `error` is set only by an
// `apply_update` failure (elevation cancelled, install.sh non-zero exit).
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'updating' | 'error';

interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  error: string | null;
  setChecking: () => void;
  setAvailable: (info: UpdateInfo) => void;
  setUpdating: () => void;
  setError: (message: string) => void;
  setIdle: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: 'idle',
  info: null,
  error: null,
  setChecking: () => set({ status: 'checking', error: null }),
  setAvailable: (info) => set({ status: 'available', info, error: null }),
  setUpdating: () => set({ status: 'updating', error: null }),
  setError: (message) => set({ status: 'error', error: message }),
  setIdle: () => set({ status: 'idle', info: null, error: null }),
}));
