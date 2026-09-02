// Copyright 2026 ZenohX Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EncodingType, MdnsStatus } from '../types/zenoh';
import { getMdnsStatus, setMdnsConfig, refreshMdnsInterfaces, isTauriAvailable } from '../lib/ipc';

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

  // mDNS Responder Configuration & Runtime Status
  mdnsEnabled: boolean;
  mdnsHostname: string;
  mdnsStatus: MdnsStatus | null;
  isMdnsLoading: boolean;
  isLoadingMdns: boolean;
  mdnsError: string | null;

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
  setMdnsEnabled: (enabled: boolean) => void;
  setMdnsHostname: (hostname: string) => void;
  fetchMdnsStatus: () => Promise<void>;
  updateMdnsConfig: (enabled: boolean, hostname: string) => Promise<void>;
  updateMdnsSettings: (enabled: boolean, hostname: string) => Promise<void>;
  refreshMdnsInterfaces: () => Promise<void>;
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
  mdnsEnabled: true,
  mdnsHostname: 'zenohx',
  mdnsStatus: null as MdnsStatus | null,
  isMdnsLoading: false,
  isLoadingMdns: false,
  mdnsError: null as string | null,
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
    (set, get) => ({
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

      setMdnsEnabled: (mdnsEnabled) => set({ mdnsEnabled }),

      setMdnsHostname: (mdnsHostname) => set({ mdnsHostname }),

      fetchMdnsStatus: async () => {
        set({ isMdnsLoading: true, isLoadingMdns: true, mdnsError: null });
        try {
          const status = await getMdnsStatus();
          set({
            mdnsStatus: status,
            mdnsEnabled: status.enabled,
            mdnsHostname: status.configured_hostname || get().mdnsHostname,
            isMdnsLoading: false,
            isLoadingMdns: false,
            mdnsError: null,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          set({
            isMdnsLoading: false,
            isLoadingMdns: false,
            mdnsError: errMsg,
          });
        }
      },

      updateMdnsConfig: async (enabled: boolean, hostname: string) => {
        set({ isMdnsLoading: true, isLoadingMdns: true, mdnsError: null });
        try {
          const status = await setMdnsConfig(enabled, hostname);
          set({
            mdnsEnabled: status.enabled,
            mdnsHostname: status.configured_hostname,
            mdnsStatus: status,
            isMdnsLoading: false,
            isLoadingMdns: false,
            mdnsError: null,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          set({
            isMdnsLoading: false,
            isLoadingMdns: false,
            mdnsError: errMsg,
          });
          throw err;
        }
      },

      updateMdnsSettings: async (enabled: boolean, hostname: string) => {
        return get().updateMdnsConfig(enabled, hostname);
      },

      refreshMdnsInterfaces: async () => {
        set({ isMdnsLoading: true, isLoadingMdns: true, mdnsError: null });
        try {
          const status = await refreshMdnsInterfaces();
          set({
            mdnsStatus: status,
            isMdnsLoading: false,
            isLoadingMdns: false,
            mdnsError: null,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          set({
            isMdnsLoading: false,
            isLoadingMdns: false,
            mdnsError: errMsg,
          });
          throw err;
        }
      },

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
        if (typeof window !== 'undefined' && isTauriAvailable()) {
          state?.fetchMdnsStatus?.().catch(() => {});
        }
      },
    }
  )
);

/**
 * Resolves the active mDNS hostname (.local) from current settings state.
 */
export function getActiveMdnsHost(state: Pick<SettingsState, 'mdnsHostname' | 'mdnsStatus'>): string {
  if (state.mdnsStatus?.active_hostname) {
    return state.mdnsStatus.active_hostname;
  }
  const name = state.mdnsHostname || 'zenohx';
  return name.endsWith('.local') ? name : `${name}.local`;
}

/**
 * React hook to retrieve the active mDNS hostname.
 */
export const useActiveMdnsHost = (): string => {
  return useSettingsStore((s) => getActiveMdnsHost(s));
};

