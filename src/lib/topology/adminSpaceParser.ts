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

/**
 * Zenoh Admin Space (@/**) Response Parser
 * Transforms distributed admin introspection replies into structured topology nodes and links.
 */

import type {
  AdminSpaceEntry,
  AdminRemoteNode,
  AdminRemoteLink,
  AdminTopologyData,
} from '../../types/topology';
import type { SessionLinkInfo } from '../../types/zenoh';
import { filterRealLocators, isEphemeralPortLocator } from '../tls';

const RESERVED_ADMIN_PATH_TOKENS = new Set([
  'session',
  'link',
  'links',
  'linkstate',
  'linkstates',
  'link_state',
  'link_states',
  'link-state',
  'link-states',
  'route',
  'routes',
  'routing',
  'neighbor',
  'neighbors',
  'topology',
  'discovery',
  'scout',
  'transport',
  'transports',
  'unicast',
  'multicast',
  'listen',
  'listener',
  'listeners',
  'connect',
  'connector',
  'connectors',
  'router',
  'routers',
  'peer',
  'peers',
  'client',
  'clients',
  'subscriber',
  'subscribers',
  'publisher',
  'publishers',
  'queryable',
  'queryables',
  'admin',
  'info',
  'config',
  'stats',
  'status',
  'log',
  'logs',
  'plugin',
  'plugins',
  'storage',
  'storages',
  'bridge',
  'bridges',
  'interfaces',
  'interface',
  'tcp',
  'tls',
  'quic',
  'udp',
  'ws',
  'wss',
  'unix',
  'unixpipe',
  'serial',
  'bluetooth',
  'can',
  'raw',
  'auth',
  'usrpwd',
  'tls_config',
  'default',
  'local',
  'remote',
  'other',
  'version',
  'id',
  'zid',
  'whatami',
]);

/**
 * Validates if a string is likely a Zenoh ZID (e.g. hex or UUID or test identifier) and not a path keyword or port.
 */
export function isLikelyZid(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim().toLowerCase();
  if (RESERVED_ADMIN_PATH_TOKENS.has(clean)) return false;
  if (
    clean.includes('linkstate') ||
    clean.includes('link_state') ||
    clean.includes('link-state')
  ) {
    return false;
  }
  // Reject pure numbers (ports, indices like 7447, 8080, 0, 1)
  if (/^\d+$/.test(clean)) return false;
  // Reject IP addresses / hostnames with dots, colons, or slashes
  if (clean.includes('.') || clean.includes(':') || clean.includes('/')) return false;
  // Match standard hex ZID (8 to 64 chars hex), UUIDs, or test ZID identifiers
  return (
    /^[0-9a-f]{8,64}$/.test(clean) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clean) ||
    /^(zid|router|peer|client|node|prof|local|remote)[-_a-z0-9]+$/.test(clean)
  );
}

/**
 * Parses raw JSON string safely, returning null on syntax error.
 */
function safeJsonParse<T = Record<string, unknown>>(str: string): T | null {
  if (!str || typeof str !== 'string') return null;
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/**
 * Normalizes node role from string.
 */
function normalizeNodeType(role?: string): 'router' | 'peer' | 'client' {
  if (!role) return 'router';
  const clean = role.toLowerCase();
  if (clean.includes('peer')) return 'peer';
  if (clean.includes('client')) return 'client';
  return 'router';
}

/**
 * Helper to expand 0.0.0.0 locators into real interface addresses if available.
 */
function expandBoundLocator(loc: string, interfaces?: string[]): string[] {
  if (!loc) return [];
  if (!loc.includes('0.0.0.0') || !interfaces || interfaces.length === 0) {
    return [loc];
  }
  const realIps = interfaces.filter((i) => i && i !== '0.0.0.0' && i !== '127.0.0.1');
  if (realIps.length === 0) return [loc];
  return realIps.map((ip) => loc.replace('0.0.0.0', ip));
}

/**
 * Parses an array of raw AdminSpaceEntry objects into a normalized AdminTopologyData structure.
 */
export function parseAdminSpaceEntries(entries: AdminSpaceEntry[]): AdminTopologyData {
  const nodes = new Map<string, AdminRemoteNode>();
  const links: AdminRemoteLink[] = [];

  const getOrCreateNode = (zid: string, fallbackType: 'router' | 'peer' | 'client' = 'router'): AdminRemoteNode => {
    const cleanZid = zid.toLowerCase();
    let node = nodes.get(cleanZid);
    if (!node) {
      node = {
        zid: cleanZid,
        whatami: fallbackType,
        locators: [],
        connectLocators: [],
        neighbors: [],
        links: [],
      };
      nodes.set(cleanZid, node);
    }
    return node;
  };

  for (const entry of entries) {
    if (!entry.keyExpr) continue;
    const key = entry.keyExpr;
    const category = entry.category || '';
    const payloadStr = entry.payloadJson || '';
    const payloadObj = safeJsonParse<Record<string, unknown>>(payloadStr);

    const cleanKey = key.replace(/^@\/?/, '');
    const parts = cleanKey.split('/');

    // 1. Identify the hosting root ZID (parts[0] in standard @/<zid>/... admin keys)
    let targetZid: string | undefined;
    if (parts.length > 0 && isLikelyZid(parts[0])) {
      targetZid = parts[0];
    } else if (entry.zid && isLikelyZid(entry.zid)) {
      targetZid = entry.zid;
    } else if (payloadObj && typeof payloadObj.zid === 'string' && isLikelyZid(payloadObj.zid)) {
      targetZid = payloadObj.zid;
    }

    // 2. Handle Router Entries (@/<zid>/router or @/<zid>/router/<neighbor_zid>)
    if (category === 'router' || key.includes('/router')) {
      const routerIndex = parts.findIndex((p) => p.toLowerCase() === 'router');
      if (routerIndex !== -1 && routerIndex + 1 < parts.length) {
        const rootZid = parts[0];
        const neighborZid = parts[routerIndex + 1];
        if (isLikelyZid(rootZid) && isLikelyZid(neighborZid) && rootZid.toLowerCase() !== neighborZid.toLowerCase()) {
          const nodeA = getOrCreateNode(rootZid, 'router');
          const nodeB = getOrCreateNode(neighborZid, 'router');
          if (!nodeA.neighbors.includes(nodeB.zid)) nodeA.neighbors.push(nodeB.zid);
          if (!nodeB.neighbors.includes(nodeA.zid)) nodeB.neighbors.push(nodeA.zid);
        }
        continue;
      }

      // Exact @/<zid>/router entry with locators and sessions array
      if (targetZid && (parts.length === routerIndex + 1 || key.endsWith('/router'))) {
        const routerNode = getOrCreateNode(targetZid, 'router');
        if (payloadObj) {
          if (Array.isArray(payloadObj.locators)) {
            const locs = payloadObj.locators.filter((l): l is string => typeof l === 'string');
            routerNode.locators = filterRealLocators(Array.from(new Set([...routerNode.locators, ...locs])));
          }
          if (typeof payloadObj.version === 'string') {
            routerNode.version = payloadObj.version;
          }
          if (Array.isArray(payloadObj.sessions)) {
            for (const sess of payloadObj.sessions) {
              if (!sess || typeof sess !== 'object') continue;
              const sessObj = sess as Record<string, unknown>;
              const peerZid = typeof sessObj.peer === 'string' && isLikelyZid(sessObj.peer) ? sessObj.peer.toLowerCase() : undefined;
              if (!peerZid || peerZid === targetZid.toLowerCase()) continue;
              const peerRole = typeof sessObj.whatami === 'string' ? normalizeNodeType(sessObj.whatami) : 'client';
              const peerNode = getOrCreateNode(peerZid, peerRole);
              if (sessObj.whatami) peerNode.whatami = peerRole;

              if (!routerNode.neighbors.includes(peerZid)) routerNode.neighbors.push(peerZid);
              if (!peerNode.neighbors.includes(targetZid.toLowerCase())) peerNode.neighbors.push(targetZid.toLowerCase());

              if (Array.isArray(sessObj.links)) {
                for (const lk of sessObj.links) {
                  if (!lk || typeof lk !== 'object') continue;
                  const lkObj = lk as Record<string, unknown>;
                  const src = typeof lkObj.src === 'string' ? lkObj.src : '';
                  const dst = typeof lkObj.dst === 'string' ? lkObj.dst : '';
                  if (src && !isEphemeralPortLocator(src)) {
                    peerNode.connectLocators = filterRealLocators(
                      Array.from(new Set([...peerNode.connectLocators, src]))
                    );
                    routerNode.locators = filterRealLocators(
                      Array.from(new Set([...routerNode.locators, src]))
                    );
                  }
                  if (dst && !isEphemeralPortLocator(dst)) {
                    routerNode.connectLocators = filterRealLocators(
                      Array.from(new Set([...routerNode.connectLocators, dst]))
                    );
                  }

                  const peerLink: SessionLinkInfo = {
                    zid: targetZid.toLowerCase(),
                    whatami: 'router',
                    src: dst,
                    dst: src,
                    is_streamed: true,
                    interfaces: [],
                  };
                  peerNode.links.push(peerLink);

                  const routerLink: SessionLinkInfo = {
                    zid: peerZid,
                    whatami: peerRole,
                    src,
                    dst,
                    is_streamed: true,
                    interfaces: [],
                  };
                  routerNode.links.push(routerLink);

                  links.push({
                    sourceZid: targetZid.toLowerCase(),
                    targetZid: peerZid,
                    srcLocator: src,
                    dstLocator: dst,
                    isStreamed: true,
                  });
                }
              }
            }
          }
        }
        continue;
      }
    }

    if (!targetZid) {
      // Cannot attribute to a verified root ZID, ignore to prevent creating fake nodes
      continue;
    }

    const node = getOrCreateNode(targetZid);

    // 3. Handle Session Info (@/<zid>/session/info)
    if (category === 'info' || key.includes('/session/info') || key.includes('/info')) {
      if (payloadObj) {
        if (payloadObj.whatami && typeof payloadObj.whatami === 'string') {
          node.whatami = normalizeNodeType(payloadObj.whatami);
        }
        if (payloadObj.version && typeof payloadObj.version === 'string') {
          node.version = payloadObj.version;
        }
        if (Array.isArray(payloadObj.locators)) {
          const locs = payloadObj.locators.filter((l): l is string => typeof l === 'string');
          node.locators = filterRealLocators(Array.from(new Set([...node.locators, ...locs])));
        }
        node.rawInfo = payloadObj;
      }
    }
    // 4. Handle Links (@/<zid>/session/transport/unicast/<peer_zid>/link/<link_hash> OR @/<zid>/session/link/...)
    else if (category === 'link' || key.includes('/link')) {
      if (payloadObj) {
        const src = typeof payloadObj.src === 'string' ? payloadObj.src : '';
        const dst = typeof payloadObj.dst === 'string' ? payloadObj.dst : '';
        const isStreamed = typeof payloadObj.is_streamed === 'boolean' ? payloadObj.is_streamed : undefined;
        const mtu = typeof payloadObj.mtu === 'number' ? payloadObj.mtu : undefined;
        const interfaces = Array.isArray(payloadObj.interfaces)
          ? payloadObj.interfaces.filter((i): i is string => typeof i === 'string')
          : [];

        let remoteZid =
          typeof payloadObj.zid === 'string' && isLikelyZid(payloadObj.zid)
            ? payloadObj.zid.toLowerCase()
            : undefined;

        // If remoteZid not in payload, extract from key path: .../unicast/<peer_zid>/link/...
        if (!remoteZid) {
          const transportIdx = parts.findIndex((p) => p === 'unicast' || p === 'multicast');
          if (transportIdx !== -1 && transportIdx + 1 < parts.length && isLikelyZid(parts[transportIdx + 1])) {
            remoteZid = parts[transportIdx + 1].toLowerCase();
          }
        }

        const isListenSocket = key.includes('/listen');

        if (isListenSocket) {
          // Listen socket - extract local listen locator for the router node
          if (src) {
            const expanded = expandBoundLocator(src, interfaces);
            node.locators = filterRealLocators(
              Array.from(new Set([...node.locators, ...expanded]))
            );
          }
        } else {
          // Active connection link to an external peer or router
          let peerNode: AdminRemoteNode | undefined;
          if (remoteZid && remoteZid !== targetZid.toLowerCase()) {
            peerNode = getOrCreateNode(remoteZid);
            if (!node.neighbors.includes(remoteZid)) node.neighbors.push(remoteZid);
            if (!peerNode.neighbors.includes(targetZid.toLowerCase())) peerNode.neighbors.push(targetZid.toLowerCase());
          }

          const linkInfo: SessionLinkInfo = {
            zid: remoteZid || targetZid,
            whatami:
              typeof payloadObj.whatami === 'string'
                ? normalizeNodeType(payloadObj.whatami)
                : node.whatami,
            src,
            dst,
            is_streamed: Boolean(isStreamed),
            mtu,
            interfaces,
          };
          node.links.push(linkInfo);

          if (dst) {
            if (!isEphemeralPortLocator(dst)) {
              const expandedDst = expandBoundLocator(dst, interfaces);
              node.connectLocators = filterRealLocators(
                Array.from(new Set([...node.connectLocators, ...expandedDst]))
              );
            } else if (peerNode && src && !isEphemeralPortLocator(src)) {
              // Inbound client connection: src is the listening address of this node,
              // and peerNode is the inbound client connecting to it.
              const expandedSrc = expandBoundLocator(src, interfaces);
              peerNode.connectLocators = filterRealLocators(
                Array.from(new Set([...peerNode.connectLocators, ...expandedSrc]))
              );
            }

            links.push({
              sourceZid: targetZid.toLowerCase(),
              targetZid: remoteZid,
              srcLocator: src,
              dstLocator: dst,
              isStreamed,
              mtu,
              interfaces,
            });
          }
        }
      }
    }
    // 5. Handle Transports / Listen Endpoints (@/<zid>/session/transport/unicast/<peer_zid> OR .../listen/...)
    else if (
      category === 'transport' ||
      key.includes('/session/transport') ||
      key.includes('/transport/')
    ) {
      if (payloadObj) {
        // Handle remote peer transport entry: @/<zid>/session/transport/unicast/<peer_zid>
        const transportIdx = parts.findIndex((p) => p === 'unicast' || p === 'multicast');
        if (transportIdx !== -1 && transportIdx + 1 < parts.length) {
          const peerZid = parts[transportIdx + 1];
          if (isLikelyZid(peerZid) && peerZid.toLowerCase() !== targetZid.toLowerCase()) {
            const role =
              typeof payloadObj.whatami === 'string'
                ? normalizeNodeType(payloadObj.whatami)
                : 'client';
            const peerNode = getOrCreateNode(peerZid.toLowerCase(), role);
            if (payloadObj.whatami) {
              peerNode.whatami = role;
            }
            if (!node.neighbors.includes(peerNode.zid)) node.neighbors.push(peerNode.zid);
            if (!peerNode.neighbors.includes(node.zid)) peerNode.neighbors.push(node.zid);
          }
        }

        const rawLocators: string[] = [];
        if (typeof payloadObj.locator === 'string' && payloadObj.locator) {
          rawLocators.push(payloadObj.locator);
        }
        if (Array.isArray(payloadObj.locators)) {
          payloadObj.locators.forEach((l) => {
            if (typeof l === 'string' && l) rawLocators.push(l);
          });
        }

        // If key path contains listen endpoint locator (e.g. .../listen/tcp/0.0.0.0/7447)
        if (rawLocators.length === 0 && key.includes('/listen/')) {
          const listenIdx = parts.findIndex((p) => p.toLowerCase() === 'listen');
          if (listenIdx !== -1 && listenIdx + 3 < parts.length) {
            const proto = parts[listenIdx + 1];
            const host = parts[listenIdx + 2];
            const port = parts[listenIdx + 3];
            if (proto && host && port) {
              rawLocators.push(`${proto}/${host}:${port}`);
            }
          }
        }

        const interfaces = Array.isArray(payloadObj.interfaces)
          ? payloadObj.interfaces.filter((i): i is string => typeof i === 'string')
          : [];

        const expandedLocators = rawLocators.flatMap((loc) => expandBoundLocator(loc, interfaces));
        if (expandedLocators.length > 0) {
          node.locators = filterRealLocators(
            Array.from(new Set([...node.locators, ...expandedLocators]))
          );
        }
      }
    }
    // 6. Handle Config (@/<zid>/config)
    else if (category === 'config' || key.includes('/config')) {
      if (payloadObj) {
        const rawConnects: string[] = [];
        if (Array.isArray(payloadObj.connect_locators)) {
          payloadObj.connect_locators.forEach((c) => {
            if (typeof c === 'string') rawConnects.push(c);
          });
        }
        if (Array.isArray(payloadObj.connect)) {
          payloadObj.connect.forEach((c) => {
            if (typeof c === 'string') rawConnects.push(c);
          });
        }
        const cfg = payloadObj.connect as Record<string, unknown> | undefined;
        if (cfg && typeof cfg === 'object' && Array.isArray(cfg.endpoints)) {
          cfg.endpoints.forEach((ep) => {
            if (typeof ep === 'string') rawConnects.push(ep);
          });
        }
        if (rawConnects.length > 0) {
          node.connectLocators = filterRealLocators(
            Array.from(new Set([...node.connectLocators, ...rawConnects]))
          );
        }
      }
    }
  }

  return {
    nodes,
    links,
  };
}
