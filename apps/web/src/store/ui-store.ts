import { create } from 'zustand';
type Theme = 'light' | 'dark';
interface UiState {
  theme: Theme;
  copilotOpen: boolean;
  paletteOpen: boolean;
  toast: { message: string; action?: { label: string; run: () => void } } | null;
  toggleTheme: () => void;
  toggleCopilot: () => void;
  openCopilot: () => void;
  openPalette: () => void;
  closePalette: () => void;
  showToast: (message: string, action?: { label: string; run: () => void }) => void;
  dismissToast: () => void;
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
  toggleCopilot: () => set((state) => ({ copilotOpen: !state.copilotOpen })),
  openCopilot: () => set({ copilotOpen: true }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  showToast: (message, action) => set({ toast: { message, action } }),
  dismissToast: () => set({ toast: null }),
}));
