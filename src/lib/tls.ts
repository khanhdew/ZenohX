import type { ConnectionProfile, ScoutedNode, TlsConfig } from '../types/zenoh';

export type ConnectionPreset = 'cloud' | 'local' | 'custom';

export type CloudProtocol = 'tcp' | 'tls' | 'quic' | 'udp';

export const DEFAULT_CLOUD_PROTOCOL: CloudProtocol = 'tcp';

export const SUPPORTED_CLOUD_PROTOCOLS = [
  { id: 'tcp', label: 'TCP (Plain)' },
  { id: 'tls', label: 'TLS (Secure)' },
  { id: 'quic', label: 'QUIC' },
  { id: 'udp', label: 'UDP' },
] as const;

export interface ParsedLocator {
  protocol: CloudProtocol | string;
  host: string;
  port: string;
}

export interface ResolveTlsConfigParams {
  enableTls: boolean;
  useCustomTls: boolean;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
}

/**
 * Checks whether a given TLS configuration contains any custom certificate paths.
 */
export function hasCustomTlsConfig(tlsConfig?: TlsConfig | null): boolean {
  if (!tlsConfig) return false;
  return Boolean(
    (tlsConfig.ca_cert && tlsConfig.ca_cert.trim().length > 0) ||
    (tlsConfig.client_cert && tlsConfig.client_cert.trim().length > 0) ||
    (tlsConfig.client_key && tlsConfig.client_key.trim().length > 0)
  );
}

/**
 * Determines whether TLS is enabled based on profile configuration and locators.
 */
export function isTlsEnabled(tlsConfig?: TlsConfig | null, locators?: string[]): boolean {
  if (tlsConfig !== null && tlsConfig !== undefined) return true;
  if (locators && locators.some((loc) => loc.trim().toLowerCase().startsWith('tls/'))) {
    return true;
  }
  return false;
}

/**
 * Resolves the TlsConfig payload based on master toggle, custom toggle, and input fields.
 * - If `enableTls` is false: returns `null` (plain transport).
 * - If `enableTls` is true and `useCustomTls` is false: returns `{}` (TLS with common system root CAs).
 * - If `enableTls` is true and `useCustomTls` is true: returns custom `{ ca_cert, client_cert, client_key }`.
 */
export function resolveTlsConfig(params: ResolveTlsConfigParams): TlsConfig | null {
  if (!params.enableTls) {
    return null;
  }

  if (!params.useCustomTls) {
    return {};
  }

  const ca = params.caCert?.trim() || undefined;
  const cert = params.clientCert?.trim() || undefined;
  const key = params.clientKey?.trim() || undefined;

  return {
    ca_cert: ca,
    client_cert: cert,
    client_key: key,
  };
}

/**
 * Parses a single Zenoh locator (e.g. "tls/router.example.com:7447") into protocol, host, and port.
 */
export function parseLocator(locator: string): ParsedLocator | null {
  if (!locator || typeof locator !== 'string') return null;
  const trimmed = locator.trim();
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx === -1) return null;

  const protocol = trimmed.slice(0, slashIdx).toLowerCase();
  const hostAndPort = trimmed.slice(slashIdx + 1);
  const colonIdx = hostAndPort.lastIndexOf(':');
  if (colonIdx === -1) return null;

  const host = hostAndPort.slice(0, colonIdx).trim();
  const port = hostAndPort.slice(colonIdx + 1).trim();

  if (!host || !port) return null;

  return { protocol, host, port };
}

/**
 * Constructs a clean Zenoh locator string from protocol, host, and port.
 */
export function buildLocator(protocol: string, host: string, port: string): string {
  const h = host.trim();
  const p = port.trim() || '7447';
  const proto = protocol.trim().toLowerCase() || 'tcp';
  if (!h) return '';
  return `${proto}/${h}:${p}`;
}

/**
 * Detects whether an existing profile matches 'cloud', 'local', or 'custom' configuration.
 */
export function detectProfilePreset(profile?: Partial<ConnectionProfile> | null): ConnectionPreset {
  if (!profile) return 'cloud';

  const mode = (profile.mode || 'peer').toLowerCase();
  const connects = profile.connect_locators || [];
  const listens = profile.listen_locators || [];
  const hasCustomTls = hasCustomTlsConfig(profile.tls_config);
  const hasCustomConfig = Boolean(
    profile.custom_config && Object.keys(profile.custom_config).length > 0
  );

  if (hasCustomConfig || listens.length > 0 || connects.length > 1 || mode === 'router') {
    return 'custom';
  }

  if (connects.length === 1 && mode === 'client') {
    return 'cloud';
  }

  if (connects.length === 0 && listens.length === 0 && mode === 'peer' && !hasCustomTls) {
    return 'local';
  }

  return 'custom';
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

