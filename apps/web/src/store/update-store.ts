import { create } from 'zustand';

export interface UpdateInfo {
  version: string;
}

// Phases emitted by the Rust installer via `update:phase` events as the elevated
// install progresses. `waiting-permission` is surfaced before the OS auth prompt;
// `restarting` is emitted just before the app relaunches; `failed` is terminal.
export type UpdatePhase =
  | 'waiting-permission'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'failed';

// Check errors are swallowed by Rust as `null` and never become `error`; `error` is set only by an
// `apply_update` failure (elevation cancelled, install.sh non-zero exit).
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'updating' | 'error';

interface UpdateState {
  status: UpdateStatus;
  phase: UpdatePhase | null;
  info: UpdateInfo | null;
  error: string | null;
  setChecking: () => void;
  setAvailable: (info: UpdateInfo) => void;
  setUpdating: (phase?: UpdatePhase) => void;
  setPhase: (phase: UpdatePhase) => void;
  setError: (message: string) => void;
  setIdle: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: 'idle',
  phase: null,
  info: null,
  error: null,
  setChecking: () => set({ status: 'checking', error: null, phase: null }),
  setAvailable: (info) => set({ status: 'available', info, error: null, phase: null }),
  setUpdating: (phase = 'waiting-permission') => set({ status: 'updating', error: null, phase }),
  // A phase echo from Rust is only meaningful while an install is running. It must
  // never downgrade an already-failed update back to `updating` (a stale marker
  // racing a terminal failure), nor flip an idle/available state into updating.
  setPhase: (phase) =>
    set((state) => {
      if (state.status !== 'updating') return state;
      return { status: 'updating', phase };
    }),
  setError: (message) => set({ status: 'error', error: message, phase: 'failed' }),
  setIdle: () => set({ status: 'idle', info: null, error: null, phase: null }),
}));
