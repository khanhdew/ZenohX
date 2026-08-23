import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';
import {
  checkForAppUpdates,
  downloadUpdate,
  installDownloadedUpdate,
  downloadAndInstallUpdate,
} from '../lib/updater';
import { useSettingsStore } from './settingsStore';
import { APP_VERSION } from '../lib/version';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'up-to-date'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  availableUpdate: Update | null;
  version: string | null;
  releaseDate: string | null;
  notes: string | null;
  percentage: number;
  downloadedBytes: number;
  totalBytes: number;
  showNotification: boolean;
  skippedConsent: boolean;
  error: string | null;
  notice: string | null;

  checkForUpdates: (manual?: boolean) => Promise<void>;
  startDownload: (targetUpdate?: Update) => Promise<void>;
  installAndRestart: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  skipConsent: () => void;
  dismissNotification: () => void;
  resetUpdateState: () => void;
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: 'idle',
  availableUpdate: null,
  version: null,
  releaseDate: null,
  notes: null,
  percentage: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  showNotification: false,
  skippedConsent: false,
  error: null,
  notice: null,

  checkForUpdates: async (manual = false) => {
    set({ status: 'checking', error: null, notice: null });
    const now = Date.now();
    useSettingsStore.getState().setLastCheckedUpdate(now);

    try {
      const result = await checkForAppUpdates();
      if (result.updateAvailable && result.update) {
        const update = result.update;
        set({
          status: 'available',
          availableUpdate: update,
          version: result.version || update.version || null,
          releaseDate: result.date || update.date || null,
          notes: result.body || update.body || null,
          error: null,
        });

        const autoDownload = useSettingsStore.getState().autoDownload;
        if (autoDownload) {
          await get().startDownload(update);
        }
      } else if (result.error) {
        set({
          status: 'error',
          error: result.error,
        });
      } else {
        set({
          status: 'up-to-date',
          version: APP_VERSION,
          notice: `You are running the latest version of ZenohX (v${APP_VERSION}).`,
        });
        if (manual) {
          setTimeout(() => {
            if (get().status === 'up-to-date') {
              set({ notice: null });
            }
          }, 4000);
        }
      }
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  startDownload: async (targetUpdate?: Update) => {
    const update = targetUpdate || get().availableUpdate;
    if (!update) return;

    set({
      status: 'downloading',
      percentage: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      error: null,
    });

    try {
      await downloadUpdate(update, (progress) => {
        set({
          percentage: progress.percentage,
          downloadedBytes: progress.downloaded,
          totalBytes: progress.total,
        });
      });

      set({
        status: 'downloaded',
        percentage: 100,
        showNotification: true,
        skippedConsent: false,
      });
    } catch (err) {
      console.error('Download update failed:', err);
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  installAndRestart: async () => {
    const update = get().availableUpdate;
    if (!update) return;

    set({ status: 'installing', showNotification: false, error: null });

    try {
      await installDownloadedUpdate(update);
      set({ status: 'idle', availableUpdate: null, skippedConsent: false });
    } catch (err) {
      console.error('Install update failed:', err);
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  downloadAndInstall: async () => {
    const update = get().availableUpdate;
    if (!update) return;

    set({
      status: 'downloading',
      percentage: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      error: null,
      showNotification: false,
    });

    try {
      await downloadAndInstallUpdate(update, (progress) => {
        set({
          percentage: progress.percentage,
          downloadedBytes: progress.downloaded,
          totalBytes: progress.total,
        });
      });
      set({ status: 'idle', availableUpdate: null, skippedConsent: false });
    } catch (err) {
      console.error('Download and install update failed:', err);
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  skipConsent: () => {
    set({
      showNotification: false,
      skippedConsent: true,
    });
  },

  dismissNotification: () => {
    set({
      showNotification: false,
      skippedConsent: true,
    });
  },

  resetUpdateState: () => {
    set({
      status: 'idle',
      availableUpdate: null,
      version: null,
      releaseDate: null,
      notes: null,
      percentage: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      showNotification: false,
      skippedConsent: false,
      error: null,
      notice: null,
    });
  },
}));
