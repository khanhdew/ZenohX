import type { ConnectionProfile, ScoutedNode, TlsConfig } from '../types/zenoh';

export type ConnectionPreset = 'client' | 'peer' | 'router';

export type TransportProtocol = 'tcp' | 'tls' | 'quic' | 'udp';
export type CloudProtocol = TransportProtocol; // Backward-compatibility alias

export const DEFAULT_TRANSPORT_PROTOCOL: TransportProtocol = 'tcp';
export const DEFAULT_CLOUD_PROTOCOL = DEFAULT_TRANSPORT_PROTOCOL;

export const SUPPORTED_TRANSPORT_PROTOCOLS = [
  { id: 'tcp', label: 'TCP (Plain)' },
  { id: 'tls', label: 'TLS (Secure)' },
  { id: 'quic', label: 'QUIC' },
  { id: 'udp', label: 'UDP' },
] as const;
export const SUPPORTED_CLOUD_PROTOCOLS = SUPPORTED_TRANSPORT_PROTOCOLS;

export interface ParsedLocator {
  protocol: TransportProtocol | string;
  host: string;
  port: string;
}

export interface ResolveTlsConfigParams {
  enableTls: boolean;
  useCustomTls: boolean;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
  tlsOnly?: boolean;
}

/**
 * Checks whether a given TLS configuration contains any custom certificate paths.
 */
export function hasCustomTlsConfig(tlsConfig?: TlsConfig | null): boolean {
  if (!tlsConfig) return false;
  return Boolean(
    (tlsConfig.ca_cert && tlsConfig.ca_cert.trim().length > 0) ||
    (tlsConfig.client_cert && tlsConfig.client_cert.trim().length > 0) ||
    (tlsConfig.client_key && tlsConfig.client_key.trim().length > 0) ||
    tlsConfig.tls_only
  );
}

/**
 * Determines whether TLS is enabled based on profile configuration and locators.
 */
export function isTlsEnabled(tlsConfig?: TlsConfig | null, locators?: string[]): boolean {
  if (locators && locators.some((loc) => {
    const l = loc.trim().toLowerCase();
    return l.startsWith('tls/') || l.startsWith('wss/');
  })) {
    return true;
  }
  if (tlsConfig && typeof tlsConfig === 'object') {
    if (
      Boolean(tlsConfig.ca_cert) ||
      Boolean(tlsConfig.client_cert) ||
      Boolean(tlsConfig.client_key) ||
      tlsConfig.tls_only === true
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves the TlsConfig payload based on master toggle, custom toggle, input fields, and strict mode.
 * - If `enableTls` is false: returns `null` (plain transport).
 * - If `enableTls` is true and `useCustomTls` is false: returns `{ tls_only }` (TLS with system root CAs).
 * - If `enableTls` is true and `useCustomTls` is true: returns custom `{ ca_cert, client_cert, client_key, tls_only }`.
 */
export function resolveTlsConfig(params: ResolveTlsConfigParams): TlsConfig | null {
  if (!params.enableTls) {
    return null;
  }

  const result: TlsConfig = {};
  if (params.tlsOnly) {
    result.tls_only = true;
  }

  if (!params.useCustomTls) {
    return result;
  }

  const ca = params.caCert?.trim();
  const cert = params.clientCert?.trim();
  const key = params.clientKey?.trim();

  if (ca) result.ca_cert = ca;
  if (cert) result.client_cert = cert;
  if (key) result.client_key = key;

  return result;
}

/**
 * Parses a single Zenoh locator (e.g. "tls/router.example.com:7447") into protocol, host, and port.
 */
export function parseLocator(locator: string): ParsedLocator | null {
  if (!locator || typeof locator !== 'string') return null;
  const trimmed = locator.trim();
  if (!trimmed) return null;

  const slashIdx = trimmed.indexOf('/');
  if (slashIdx === -1) {
    const colonIdx = trimmed.lastIndexOf(':');
    if (colonIdx !== -1) {
      const host = trimmed.slice(0, colonIdx).trim();
      const port = trimmed.slice(colonIdx + 1).trim();
      if (host && port) {
        return { protocol: 'tcp', host, port };
      }
    }
    return null;
  }

  const protocol = trimmed.slice(0, slashIdx).toLowerCase();
  const hostAndPort = trimmed.slice(slashIdx + 1);
  const colonIdx = hostAndPort.lastIndexOf(':');
  if (colonIdx === -1) {
    const host = hostAndPort.trim();
    if (host) {
      return { protocol, host, port: '7447' };
    }
    return null;
  }

  const host = hostAndPort.slice(0, colonIdx).trim();
  const port = hostAndPort.slice(colonIdx + 1).trim() || '7447';

  if (!host) return null;

  return { protocol, host, port };
}

/**
 * Constructs a clean Zenoh locator string from protocol, host, and port.
 */
export function buildLocator(protocol: string, host: string, port: string): string {
  const h = host.trim();
  if (!h) return '';

  const parsed = parseLocator(h);
  if (parsed) {
    const proto = protocol.trim().toLowerCase() || parsed.protocol || 'tcp';
    const p = port.trim() !== '' ? port.trim() : parsed.port || '7447';
    return `${proto}/${parsed.host}:${p}`;
  }

  const p = port.trim() !== '' ? port.trim() : '7447';
  const proto = protocol.trim().toLowerCase() || 'tcp';
  return `${proto}/${h}:${p}`;
}

/**
 * Scans existing connection profiles to find the next available router listen port (starting at 7447).
 */
export function getSuggestedRouterPort(profiles?: ConnectionProfile[]): string {
  if (!profiles || profiles.length === 0) return '7447';

  const usedPorts = new Set<number>();
  profiles.forEach((p) => {
    if (p.listen_locators) {
      p.listen_locators.forEach((loc) => {
        const parsed = parseLocator(loc);
        if (parsed && parsed.port) {
          const num = parseInt(parsed.port, 10);
          if (!isNaN(num) && num > 0) {
            usedPorts.add(num);
          }
        }
      });
    }
  });

  let port = 7447;
  while (usedPorts.has(port)) {
    port++;
  }
  return port.toString();
}

/**
 * Returns a random port in the 7448-7999 range.
 */
export function getRandomRouterPort(): string {
  const min = 7448;
  const max = 7999;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

/**
 * Detects whether an existing profile matches 'client', 'peer', or 'router' configuration.
 */
export function detectProfilePreset(profile?: Partial<ConnectionProfile> | null): ConnectionPreset {
  if (!profile) return 'client';

  const mode = (profile.mode || 'peer').toLowerCase();

  if (mode === 'router') {
    return 'router';
  }

  if (mode === 'client') {
    return 'client';
  }

  return 'peer';
}

/**
 * Extracts protocol prefix from a locator string (e.g. "tls", "tcp", "quic", "udp").
 */
export function getLocatorProtocol(locator: string): string {
  if (!locator || typeof locator !== 'string') return '';
  const slashIdx = locator.indexOf('/');
  if (slashIdx === -1) return '';
  return locator.slice(0, slashIdx).trim().toLowerCase();
}

/**
 * Returns the preferred locator from a list of advertised locators.
 * Prioritizes TLS locators ('tls/...') if available, otherwise returns the first locator.
 */
export function getPreferredLocator(locators: string[]): string | undefined {
  if (!locators || locators.length === 0) return undefined;
  const tlsLoc = locators.find((l) => getLocatorProtocol(l) === 'tls');
  return tlsLoc || locators[0];
}

export interface BuildProfileFromScoutedNodeOptions {
  selectedLocator?: string;
  enableTls?: boolean;
  customTls?: TlsConfig | null;
}

/**
 * Constructs a ready-to-use ConnectionProfile from a discovered ScoutedNode with smart TLS detection.
 */
export function buildProfileFromScoutedNode(
  node: ScoutedNode,
  options?: BuildProfileFromScoutedNodeOptions
): ConnectionProfile {
  const isRouter = (node.what || '').toLowerCase() === 'router';
  const shortZid = node.zid ? node.zid.slice(0, 8) : 'unknown';
  const now = Date.now();

  const chosenLocator = options?.selectedLocator || getPreferredLocator(node.locators || []);
  const locators = chosenLocator
    ? [chosenLocator]
    : node.locators && node.locators.length > 0
    ? [...node.locators]
    : [];

  const isTlsLocator = chosenLocator
    ? getLocatorProtocol(chosenLocator) === 'tls'
    : locators.some((l) => getLocatorProtocol(l) === 'tls');
  const tlsEnabled = options?.enableTls !== undefined ? options.enableTls : isTlsLocator;

  let tlsConfig: TlsConfig | null = null;
  if (tlsEnabled) {
    tlsConfig = options?.customTls !== undefined ? options.customTls : {};
  }

  return {
    id: crypto.randomUUID(),
    name: `Zenoh ${isRouter ? 'Router' : 'Peer'} (${shortZid})`,
    mode: isRouter ? 'client' : 'peer',
    connect_locators: locators,
    listen_locators: [],
    scout_multicast: true,
    user_auth: null,
    tls_config: tlsConfig,
    custom_config: null,
    created_at: now,
    updated_at: now,
  };
}

