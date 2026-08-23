import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EncodingType } from '../types/zenoh';

export type ThemeMode = 'dark' | 'light' | 'system';
export type UpdateChannel = 'stable' | 'beta' | 'nightly';
export type CodeFont = 'mono' | 'jetbrains' | 'fira';

export interface SettingsState {
  // Appearance
  theme: ThemeMode;
  compactMode: boolean;
  codeFont: CodeFont;

  // Auto-Update
  autoCheckUpdates: boolean;
  updateChannel: UpdateChannel;
  autoDownload: boolean;
  lastCheckedUpdate: number | null;

  // General & Network
  defaultPayloadEncoding: EncodingType;
  maxMessageBuffer: number;
  defaultQueryTimeoutMs: number;

  // Privacy & Telemetry
  anonymousTelemetry: boolean;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setCompactMode: (compact: boolean) => void;
  setCodeFont: (font: CodeFont) => void;
  setAutoCheckUpdates: (enabled: boolean) => void;
  setUpdateChannel: (channel: UpdateChannel) => void;
  setAutoDownload: (enabled: boolean) => void;
  setLastCheckedUpdate: (timestamp: number) => void;
  setDefaultPayloadEncoding: (encoding: EncodingType) => void;
  setMaxMessageBuffer: (bufferSize: number) => void;
  setDefaultQueryTimeoutMs: (timeoutMs: number) => void;
  setAnonymousTelemetry: (enabled: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS = {
  theme: 'dark' as ThemeMode,
  compactMode: false,
  codeFont: 'mono' as CodeFont,
  autoCheckUpdates: true,
  updateChannel: 'stable' as UpdateChannel,
  autoDownload: true,
  lastCheckedUpdate: null,
  defaultPayloadEncoding: 'json' as EncodingType,
  maxMessageBuffer: 1000,
  defaultQueryTimeoutMs: 3000,
  anonymousTelemetry: true,
};

export function applyThemeToDom(theme: ThemeMode) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  let isDark = theme === 'dark';

  if (theme === 'system') {
    isDark = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  }

  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
  }

  if (document.body) {
    document.body.classList.remove('dark', 'light');
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) => {
        applyThemeToDom(theme);
        set({ theme });
      },

      setCompactMode: (compactMode) => set({ compactMode }),

      setCodeFont: (codeFont) => set({ codeFont }),

      setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),

      setUpdateChannel: (updateChannel) => set({ updateChannel }),

      setAutoDownload: (autoDownload) => set({ autoDownload }),

      setLastCheckedUpdate: (lastCheckedUpdate) => set({ lastCheckedUpdate }),

      setDefaultPayloadEncoding: (defaultPayloadEncoding) => set({ defaultPayloadEncoding }),

      setMaxMessageBuffer: (maxMessageBuffer) => set({ maxMessageBuffer }),

      setDefaultQueryTimeoutMs: (defaultQueryTimeoutMs) => set({ defaultQueryTimeoutMs }),

      setAnonymousTelemetry: (anonymousTelemetry) => set({ anonymousTelemetry }),

      resetToDefaults: () => {
        applyThemeToDom(DEFAULT_SETTINGS.theme);
        set(DEFAULT_SETTINGS);
      },
    }),
    {
      name: 'zenohx-settings',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyThemeToDom(state.theme);
        }
      },
    }
  )
);
