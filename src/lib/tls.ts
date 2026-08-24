import type { ConnectionMode, ConnectionProfile, ScoutedNode, TlsConfig } from '../types/zenoh';

export type ConnectionPreset = 'client' | 'peer' | 'router';

export type TransportProtocol = 'tcp' | 'tls' | 'quic' | 'udp' | 'ws' | 'wss' | 'unix';
export type CloudProtocol = TransportProtocol; // Backward-compatibility alias

export const DEFAULT_TRANSPORT_PROTOCOL: TransportProtocol = 'tcp';
export const DEFAULT_CLOUD_PROTOCOL = DEFAULT_TRANSPORT_PROTOCOL;

export const SUPPORTED_TRANSPORT_PROTOCOLS = [
  { id: 'tcp', label: 'TCP (Plain)', defaultPort: '7447' },
  { id: 'tls', label: 'TLS (Secure)', defaultPort: '7446' },
  { id: 'quic', label: 'QUIC', defaultPort: '7448' },
  { id: 'udp', label: 'UDP', defaultPort: '7449' },
  { id: 'ws', label: 'WebSocket', defaultPort: '8080' },
  { id: 'wss', label: 'WS Secure', defaultPort: '8443' },
  { id: 'unix', label: 'Unix Socket', defaultPort: '' },
] as const;
export const SUPPORTED_CLOUD_PROTOCOLS = SUPPORTED_TRANSPORT_PROTOCOLS;

export interface ProductionPreset {
  id: string;
  role: 'router' | 'peer' | 'client';
  label: string;
  description: string;
  mode: ConnectionMode;
  defaultProtocol: TransportProtocol;
  defaultPort: string;
  suggestedLocators: string[];
  scoutMulticast: boolean;
  scoutGossip: boolean;
}

export const PRODUCTION_PRESETS: ProductionPreset[] = [
  {
    id: 'router-standard',
    role: 'router',
    label: 'Standard Router / Broker',
    description: 'Multi-transport hub routing traffic for local and remote clients & peers.',
    mode: 'router',
    defaultProtocol: 'tcp',
    defaultPort: '7447',
    suggestedLocators: ['tcp/0.0.0.0:7447', 'ws/0.0.0.0:8080'],
    scoutMulticast: true,
    scoutGossip: true,
  },
  {
    id: 'peer-mesh',
    role: 'peer',
    label: 'P2P Mesh Node',
    description: 'Autonomous mesh participant with peer-to-peer multicast and gossip scouting.',
    mode: 'peer',
    defaultProtocol: 'tcp',
    defaultPort: '7447',
    suggestedLocators: [],
    scoutMulticast: true,
    scoutGossip: true,
  },
  {
    id: 'client-edge',
    role: 'client',
    label: 'Edge Client',
    description: 'Lightweight unidirectional node connecting to an upstream cloud or edge router.',
    mode: 'client',
    defaultProtocol: 'tcp',
    defaultPort: '7447',
    suggestedLocators: ['tcp/127.0.0.1:7447'],
    scoutMulticast: false,
    scoutGossip: false,
  },
];

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
 * Parses a single Zenoh locator (e.g. "tls/router.example.com:7447" or "unixpipe//tmp/zenoh.sock") into protocol, host, and port.
 */
export function parseLocator(locator: string): ParsedLocator | null {
  if (!locator || typeof locator !== 'string') return null;
  const trimmed = locator.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('unixpipe/')) {
    const path = trimmed.slice('unixpipe/'.length).trim();
    return { protocol: 'unix', host: path.startsWith('/') ? path : `/${path}`, port: '' };
  }

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

  const rawProtocol = trimmed.slice(0, slashIdx).toLowerCase();
  const protocol = rawProtocol === 'unixpipe' ? 'unix' : rawProtocol;
  const hostAndPort = trimmed.slice(slashIdx + 1);

  if (protocol === 'unix') {
    return { protocol: 'unix', host: hostAndPort.startsWith('/') ? hostAndPort : `/${hostAndPort}`, port: '' };
  }

  const colonIdx = hostAndPort.lastIndexOf(':');
  if (colonIdx === -1) {
    const host = hostAndPort.trim();
    if (host) return { protocol, host, port: '7447' };
    return null;
  }

  const host = hostAndPort.slice(0, colonIdx).trim();
  const port = hostAndPort.slice(colonIdx + 1).trim() || '7447';
  if (!host) return null;

  return { protocol, host, port };
}

/**
 * Checks whether a bound locator was dynamically assigned from an ephemeral port (e.g. port 0).
 */
export function isEphemeralLocator(
  boundLocator: string,
  configuredListenLocators?: string[]
): boolean {
  if (!boundLocator || typeof boundLocator !== 'string') return false;
  if (!configuredListenLocators || configuredListenLocators.length === 0) return false;

  const parsedBound = parseLocator(boundLocator);
  if (!parsedBound) return false;

  return configuredListenLocators.some((listenLoc) => {
    if (!listenLoc || typeof listenLoc !== 'string') return false;
    const parsedListen = parseLocator(listenLoc);
    if (!parsedListen) return false;

    // Check if configured port was explicitly '0'
    const isPortZero =
      parsedListen.port === '0' ||
      listenLoc.trim().endsWith(':0') ||
      listenLoc.includes(':0/');
    if (!isPortZero) return false;

    // Check protocol match (e.g. 'tcp' matches 'tcp', 'ws' matches 'ws')
    const boundProto = parsedBound.protocol.toLowerCase();
    const listenProto = parsedListen.protocol.toLowerCase();

    return boundProto === listenProto || (listenProto === 'tcp' && boundProto === 'tcp');
  });
}


/**
 * Constructs a clean Zenoh locator string from protocol, host, and port.
 */
export function buildLocator(protocol: string, host: string, port: string): string {
  const h = host.trim();
  if (!h) return '';

  const proto = protocol.trim().toLowerCase() || 'tcp';
  if (proto === 'unix' || proto === 'unixpipe') {
    const cleanPath = h.startsWith('/') ? h : `/${h}`;
    return `unixpipe/${cleanPath}`;
  }

  const parsed = parseLocator(h);
  if (parsed && parsed.protocol !== 'unix') {
    const p = port.trim() !== '' ? port.trim() : parsed.port || '7447';
    return `${proto}/${parsed.host}:${p}`;
  }

  const p = port.trim() !== '' ? port.trim() : '7447';
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
 * Extracts protocol prefix from a locator string (e.g. "tls", "tcp", "quic", "udp", "unix").
 */
export function getLocatorProtocol(locator: string): string {
  if (!locator || typeof locator !== 'string') return '';
  const trimmed = locator.trim();
  if (trimmed.startsWith('unixpipe/')) return 'unix';
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx === -1) return '';
  const proto = trimmed.slice(0, slashIdx).trim().toLowerCase();
  return proto === 'unixpipe' ? 'unix' : proto;
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
    mode: 'client',
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

/**
 * Checks if a locator or IP address is link-local (IPv6 fe80::/10 or IPv4 169.254.0.0/16).
 */
export function isLinkLocalLocator(locator: string): boolean {
  if (!locator || typeof locator !== 'string') return false;
  const lower = locator.toLowerCase();

  // IPv6 link-local addresses fe80::/10 (fe80 to febf)
  if (
    lower.includes('[fe8') ||
    lower.includes('[fe9') ||
    lower.includes('[fea') ||
    lower.includes('[feb') ||
    lower.includes('fe80:') ||
    lower.includes('/fe80:')
  ) {
    return true;
  }

  // IPv4 link-local addresses 169.254.0.0/16
  if (lower.includes('169.254.')) {
    return true;
  }

  return false;
}

/**
 * Checks if a locator contains a loopback, link-local, or wildcard address.
 */
export function isExcludedLocator(locator: string): boolean {
  if (!locator || typeof locator !== 'string') return true;
  const lower = locator.toLowerCase();

  // Unix domain sockets are local IPC endpoints - keep them
  if (lower.startsWith('unix/') || lower.startsWith('unixpipe/')) {
    return false;
  }

  // 1. Loopback addresses (IPv6 [::1] and IPv4 127.0.0.1 / localhost)
  if (
    lower.includes('[::1]') ||
    lower.includes('/127.0.0.1') ||
    lower.includes('127.0.0.1:') ||
    lower.includes('localhost')
  ) {
    return true;
  }

  // 2. Link-local IPv6 fe80::/10 and IPv4 169.254.0.0/16
  if (isLinkLocalLocator(locator)) {
    return true;
  }

  return false;
}

/**
 * Filters out link-local locators (fe80::/10 and 169.254.0.0/16) from an array of locators.
 */
export function filterLinkLocalLocators(locators: string[]): string[] {
  if (!Array.isArray(locators)) return [];
  return locators.filter((loc) => typeof loc === 'string' && loc.trim().length > 0 && !isLinkLocalLocator(loc));
}

/**
 * Filters locators to strictly preserve real reachable IPv4 and real IPv6 addresses (and unix sockets),
 * dropping loopback ([::1], 127.0.0.1) and link-local (fe80::, 169.254.) addresses.
 */
export function filterRealLocators(locators: string[]): string[] {
  if (!Array.isArray(locators)) return [];
  const clean = locators.filter(
    (loc) => typeof loc === 'string' && loc.trim().length > 0 && !isExcludedLocator(loc)
  );

  // Fallback if all addresses were loopback on an offline machine
  if (clean.length === 0) {
    return filterLinkLocalLocators(locators);
  }

  return clean;
}

/**
 * Generates a clean, valid Zenoh JSON5 configuration string corresponding to the active SessionConfig or ConnectionProfile.
 * Strictly preserves real IPv4 & real IPv6 endpoints, excluding link-local and loopback IPs.
 */
export function generateZenohJson5(config: Partial<ConnectionProfile> | Record<string, any>): string {
  const mode = (config.mode || 'peer').toLowerCase();
  const result: Record<string, any> = {
    mode,
  };

  const rawZid = (config as any).zid;
  if (rawZid && typeof rawZid === 'string') {
    const cleanZid = rawZid.replace(/-/g, '').toLowerCase();
    if (/^[0-9a-f]{1,32}$/.test(cleanZid)) {
      result.id = cleanZid;
    }
  }

  const connectLocs = Array.isArray(config.connect_locators)
    ? filterRealLocators(config.connect_locators)
    : [];

  if (connectLocs.length > 0) {
    const reconnect = (config as any).reconnect_retry;
    result.connect = {
      endpoints: connectLocs,
      timeout_ms: reconnect?.timeout_ms ?? 0,
      exit_on_failure: false,
      retry: {
        period_init_ms: reconnect?.period_init_ms ?? 1000,
        period_max_ms: reconnect?.period_max_ms ?? 10000,
        period_increase_factor: reconnect?.factor ?? 2,
      },
    };
  }

  const listenLocs = Array.isArray(config.listen_locators)
    ? filterRealLocators(config.listen_locators)
    : [];

  if (listenLocs.length > 0) {
    result.listen = {
      endpoints: listenLocs,
    };
  }

  result.scouting = {
    multicast: {
      enabled: typeof config.scout_multicast === 'boolean' ? config.scout_multicast : mode !== 'client',
    },
    gossip: {
      enabled: typeof (config as any).scout_gossip === 'boolean' ? (config as any).scout_gossip : mode !== 'client',
    },
  };

  const auth = (config as any).user_auth;
  if (auth && (auth.username || auth.password || auth.token)) {
    result.transport = result.transport || {};
    result.transport.auth = {
      usrpwd: {
        user: auth.username || (auth.token ? 'token' : undefined),
        password: auth.password || auth.token || undefined,
      },
    };
  }

  const tls = (config as any).tls_config;
  if (tls && typeof tls === 'object') {
    const hasTlsParams = tls.ca_cert || tls.client_cert || tls.client_key || tls.tls_only;
    if (hasTlsParams) {
      result.transport = result.transport || {};
      result.transport.link = result.transport.link || {};
      const tlsObj: Record<string, any> = {};
      if (tls.ca_cert) tlsObj.root_ca_certificate = tls.ca_cert;
      if (tls.client_cert) {
        tlsObj.connect_certificate = tls.client_cert;
        tlsObj.listen_certificate = tls.client_cert;
      }
      if (tls.client_key) {
        tlsObj.connect_private_key = tls.client_key;
        tlsObj.listen_private_key = tls.client_key;
      }
      result.transport.link.tls = tlsObj;
    }
  }

  const custom = (config as any).custom_config;
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    for (const [k, v] of Object.entries(custom)) {
      if (k === 'connect') {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          result.connect = { ...(v as any), ...result.connect };
          if (connectLocs.length > 0) {
            result.connect.endpoints = connectLocs;
          }
        }
      } else if (k === 'listen') {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          result.listen = { ...(v as any), ...result.listen };
          if (listenLocs.length > 0) {
            result.listen.endpoints = listenLocs;
          }
        }
      } else if (k === 'id') {
        if (typeof v === 'string') {
          const clean = v.replace(/-/g, '').toLowerCase();
          if (/^[0-9a-f]{1,32}$/.test(clean)) {
            result.id = clean;
          }
        }
      } else if (k === 'mode') {
        if (!(k in result)) {
          result[k] = v;
        }
      } else if (v && typeof v === 'object' && !Array.isArray(v) && result[k] && typeof result[k] === 'object') {
        result[k] = { ...result[k], ...v };
      } else if (!(k in result)) {
        result[k] = v;
      }
    }
  }

  if (result.listen && Array.isArray(result.listen.endpoints)) {
    result.listen.endpoints = filterRealLocators(result.listen.endpoints);
  }
  if (result.connect && Array.isArray(result.connect.endpoints)) {
    result.connect.endpoints = filterRealLocators(result.connect.endpoints);
  }

  return JSON.stringify(result, null, 2);
}

