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
import { filterRealLocators } from '../tls';

const RESERVED_ADMIN_PATH_TOKENS = new Set([
  'session',
  'link',
  'transport',
  'router',
  'subscriber',
  'publisher',
  'queryable',
  'admin',
  'info',
  'config',
  'stats',
  'log',
  'other',
]);

/**
 * Validates if a string is likely a Zenoh ZID (e.g. hex or UUID of at least 8 chars) and not a path keyword.
 */
export function isLikelyZid(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim().toLowerCase();
  if (RESERVED_ADMIN_PATH_TOKENS.has(clean)) return false;
  return /^[0-9a-fA-F-]{8,}$/.test(clean);
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
        neighbors: [],
        links: [],
      };
      nodes.set(cleanZid, node);
    }
    return node;
  };

  for (const entry of entries) {
    if (!entry.key_expr && !entry.keyExpr) continue;
    const key = entry.keyExpr || entry.key_expr;
    const category = entry.category || '';
    const payloadStr = entry.payloadJson || entry.payload_json || '';
    const payloadObj = safeJsonParse<Record<string, unknown>>(payloadStr);

    // Extract ZID safely
    const cleanKey = key.replace(/^@\/?/, '');
    const parts = cleanKey.split('/');

    let targetZid = isLikelyZid(entry.zid) ? entry.zid : undefined;

    if (!targetZid) {
      for (const p of parts) {
        if (isLikelyZid(p)) {
          targetZid = p;
          break;
        }
      }
    }

    if (!targetZid && payloadObj && typeof payloadObj.zid === 'string' && isLikelyZid(payloadObj.zid)) {
      targetZid = payloadObj.zid;
    }

    if (category === 'router' || key.includes('/router/')) {
      // Look for neighbor router ZIDs in the path
      const validZidsInPath = parts.filter((p) => isLikelyZid(p));
      if (validZidsInPath.length >= 2) {
        const nodeA = getOrCreateNode(validZidsInPath[0], 'router');
        const nodeB = getOrCreateNode(validZidsInPath[1], 'router');
        if (!nodeA.neighbors.includes(nodeB.zid)) nodeA.neighbors.push(nodeB.zid);
        if (!nodeB.neighbors.includes(nodeA.zid)) nodeB.neighbors.push(nodeA.zid);
      } else if (validZidsInPath.length === 1 && targetZid) {
        const neighborZid = validZidsInPath[0];
        if (neighborZid !== targetZid) {
          const nodeA = getOrCreateNode(targetZid, 'router');
          const nodeB = getOrCreateNode(neighborZid, 'router');
          if (!nodeA.neighbors.includes(nodeB.zid)) nodeA.neighbors.push(nodeB.zid);
          if (!nodeB.neighbors.includes(nodeA.zid)) nodeB.neighbors.push(nodeA.zid);
        }
      }
      continue;
    }

    if (!targetZid) {
      // Cannot attribute to a specific verified ZID, ignore to prevent creating fake nodes
      continue;
    }

    const node = getOrCreateNode(targetZid);

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
    } else if (category === 'link' || key.includes('/session/link')) {
      if (payloadObj) {
        const src = typeof payloadObj.src === 'string' ? payloadObj.src : '';
        const dst = typeof payloadObj.dst === 'string' ? payloadObj.dst : '';
        const isStreamed = typeof payloadObj.is_streamed === 'boolean' ? payloadObj.is_streamed : undefined;
        const mtu = typeof payloadObj.mtu === 'number' ? payloadObj.mtu : undefined;
        const interfaces = Array.isArray(payloadObj.interfaces)
          ? payloadObj.interfaces.filter((i): i is string => typeof i === 'string')
          : [];

        // Add link to node
        const linkInfo: SessionLinkInfo = {
          zid: targetZid,
          whatami: node.whatami,
          src,
          dst,
          is_streamed: isStreamed,
          mtu,
          interfaces,
        };
        node.links.push(linkInfo);

        if (dst) {
          links.push({
            sourceZid: targetZid,
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

  return {
    nodes,
    links,
  };
}
