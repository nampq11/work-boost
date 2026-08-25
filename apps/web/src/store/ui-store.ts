import { create } from 'zustand';
type Theme = 'light' | 'dark';
interface UiState {
  theme: Theme;
  copilotOpen: boolean;
  paletteOpen: boolean;
  toast: { message: string; action?: { label: string; run: () => void } } | null;
  // Editor save behavior: autosave is ON by default so the user never has to
  // think about saving; Cmd/Ctrl+S remains available as a manual safety net.
  isAutosaveEnabled: boolean;
  toggleTheme: () => void;
  toggleCopilot: () => void;
  openCopilot: () => void;
  closeCopilot: () => void;
  openPalette: () => void;
  closePalette: () => void;
  setAutosaveEnabled: (enabled: boolean) => void;
  showToast: (message: string, action?: { label: string; run: () => void }) => void;
  dismissToast: () => void;
}

// Autosave is ON by default; it keeps the preference across sessions so a user
// who disables it never gets surprised by a write they didn't ask for.
function initialAutosaveEnabled(): boolean {
  try {
    const stored = localStorage.getItem('workboost:autosave-enabled');
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function initialTheme(): Theme {
  try {
    return localStorage.getItem('workboost:theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
export const useUiStore = create<UiState>((set) => ({
  theme: initialTheme(),
  copilotOpen: false,
  paletteOpen: false,
  toast: null,
  isAutosaveEnabled: initialAutosaveEnabled(),
  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('workboost:theme', theme);
      } catch {
        /* optional */
      }
      document.documentElement.dataset.theme = theme;
      return { theme };
    }),
  setAutosaveEnabled: (enabled) => {
    try {
      localStorage.setItem('workboost:autosave-enabled', String(enabled));
    } catch {
      /* optional */
    }
    set({ isAutosaveEnabled: enabled });
  },
  toggleCopilot: () => set((state) => ({ copilotOpen: !state.copilotOpen })),
  openCopilot: () => set({ copilotOpen: true }),
  closeCopilot: () => set({ copilotOpen: false }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  showToast: (message, action) => set({ toast: { message, action } }),
  dismissToast: () => set({ toast: null }),
}));
