import { getVersion } from '@tauri-apps/api/app';
import pkg from '../../package.json';

/**
 * Static application version extracted from package.json at build time.
 */
export const APP_VERSION: string = pkg.version;

/**
 * Dynamically queries the Tauri runtime version with a fallback to package.json.
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return pkg.version;
  }
}
