/**
 * Tauri Auto-Updater Client Helper
 * Wraps @tauri-apps/plugin-updater with progress callbacks and fallback handling.
 */

import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateProgress {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';
  version?: string;
  releaseDate?: string;
  notes?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  percentage?: number;
  error?: string;
}

export interface CheckUpdateResult {
  updateAvailable: boolean;
  update?: Update;
  version?: string;
  date?: string;
  body?: string;
  error?: string;
}

/**
 * Checks for application updates from the configured release endpoint.
 */
export async function checkForAppUpdates(): Promise<CheckUpdateResult> {
  try {
    const update = await check();
    if (update?.available) {
      return {
        updateAvailable: true,
        update,
        version: update.version,
        date: update.date,
        body: update.body,
      };
    }
    return {
      updateAvailable: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If latest.json returns 404 or endpoint is not yet populated with a newer signed build, the app is up to date
    if (
      msg.includes('404') ||
      msg.includes('Could not fetch a valid release JSON') ||
      msg.includes('status code 404') ||
      msg.includes('NotFound') ||
      msg.includes('no release found')
    ) {
      return {
        updateAvailable: false,
      };
    }
    return {
      updateAvailable: false,
      error: msg,
    };
  }
}

/**
 * Downloads the update package without restarting immediately.
 */
export async function downloadUpdate(
  update: Update,
  onProgress?: (progress: { downloaded: number; total: number; percentage: number }) => void
): Promise<void> {
  let downloaded = 0;
  let contentLength = 0;

  await update.download((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength || 0;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        if (contentLength > 0 && onProgress) {
          onProgress({
            downloaded,
            total: contentLength,
            percentage: Math.min(100, Math.round((downloaded / contentLength) * 100)),
          });
        }
        break;
      case 'Finished':
        if (onProgress) {
          onProgress({
            downloaded: contentLength || downloaded,
            total: contentLength || downloaded,
            percentage: 100,
          });
        }
        break;
    }
  });
}

/**
 * Installs the already downloaded update package and restarts the application.
 */
export async function installDownloadedUpdate(update: Update): Promise<void> {
  await update.install();
  await relaunch();
}

/**
 * Downloads and installs the pending update with real-time byte progress.
 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: { downloaded: number; total: number; percentage: number }) => void
): Promise<void> {
  let downloaded = 0;
  let contentLength = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength || 0;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        if (contentLength > 0 && onProgress) {
          onProgress({
            downloaded,
            total: contentLength,
            percentage: Math.min(100, Math.round((downloaded / contentLength) * 100)),
          });
        }
        break;
      case 'Finished':
        if (onProgress) {
          onProgress({
            downloaded: contentLength || downloaded,
            total: contentLength || downloaded,
            percentage: 100,
          });
        }
        break;
    }
  });

  // Automatically restart the application to apply the new version
  await relaunch();
}
