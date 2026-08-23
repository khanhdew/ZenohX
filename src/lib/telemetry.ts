/**
 * Lightweight, 0-dependency anonymous telemetry using PostHog HTTP API.
 * Uses native fetch with a random anonymous device UUID.
 * Respects user opt-out and never collects PII or Zenoh message payloads.
 */

import { APP_VERSION } from './version';
import { useSettingsStore } from '../stores/settingsStore';

const ANONYMOUS_ID_KEY = 'zenohx_anonymous_id';

let configuredApiKey: string | null = null;
let configuredHost: string = 'https://us.i.posthog.com';

/**
 * Generates or retrieves a persistent anonymous UUID for unique active user counting.
 */
export function getAnonymousDistinctId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'anonymous_node_client';
  }

  try {
    let id = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'ph_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem(ANONYMOUS_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous_fallback_client';
  }
}

/**
 * Detects the client's ISO country code from navigator locale or Intl API.
 */
export function getClientCountryCode(): string | undefined {
  try {
    if (
      typeof Intl !== 'undefined' &&
      typeof Intl.Locale === 'function' &&
      typeof navigator !== 'undefined' &&
      navigator.language
    ) {
      const loc = new Intl.Locale(navigator.language);
      if (loc.region) {
        return loc.region.toUpperCase();
      }
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      const parts = navigator.language.split(/[-_]/);
      if (parts.length > 1 && parts[parts.length - 1].length === 2) {
        return parts[parts.length - 1].toUpperCase();
      }
    }
  } catch {
    // Fallback safely
  }
  return undefined;
}

/**
 * Initializes telemetry configuration.
 */
export function initTelemetry(customKey?: string, customHost?: string): void {
  const apiKey = customKey || (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_POSTHOG_API_KEY : undefined);
  const host =
    customHost ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_POSTHOG_HOST : undefined) ||
    'https://us.i.posthog.com';

  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    configuredApiKey = apiKey.trim();
  }
  if (host && typeof host === 'string' && host.trim()) {
    configuredHost = host.trim().replace(/\/+$/, '');
  }
}

/**
 * Sends an anonymous custom event to PostHog HTTP endpoint if telemetry is enabled.
 */
export async function trackEvent(
  eventName: string,
  props?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    const isEnabled = useSettingsStore.getState().anonymousTelemetry;
    if (!isEnabled || !configuredApiKey) {
      return;
    }

    const distinctId = getAnonymousDistinctId();
    const payload = {
      api_key: configuredApiKey,
      event: eventName,
      distinct_id: distinctId,
      properties: {
        $lib: 'web',
        $lib_version: '1.0.0',
        app_version: APP_VERSION,
        $app_version: APP_VERSION,
        $os: typeof navigator !== 'undefined' ? navigator.platform : undefined,
        country: getClientCountryCode(),
        locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        timezone:
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
        ...props,
      },
      timestamp: new Date().toISOString(),
    };

    if (typeof fetch !== 'undefined') {
      await fetch(`${configuredHost}/capture/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'omit',
      }).catch(() => {});
    }
  } catch {
    // Fail silently without affecting application performance
  }
}

/**
 * Emits an anonymous app_started event on application launch.
 */
export async function trackAppStart(): Promise<void> {
  await trackEvent('app_started', {
    app_version: APP_VERSION,
  });
}
