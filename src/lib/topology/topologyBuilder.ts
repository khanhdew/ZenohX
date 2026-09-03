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
 * ZenohX Network Topology Data Builder
 * Transforms scouted nodes, active sessions, and connection profiles into reactive graph nodes & edges.
 */

import type {
  TopologyNode,
  TopologyEdge,
  TopologyGraphData,
  TopologyProtocol,
  BuildTopologyOptions,
} from '../../types/topology';
import type { ConnectionProfile } from '../../types/zenoh';
import { isTlsEnabled, filterRealLocators, isEphemeralPortLocator } from '../tls';

export function extractLocatorProtocol(locator: string, isTls?: boolean): TopologyProtocol {
  if (!locator || typeof locator !== 'string') return isTls ? 'tls' : 'unknown';
  const clean = locator.trim().toLowerCase();
  if (clean.startsWith('tls/') || clean.startsWith('tls:') || clean.startsWith('wss/')) return 'tls';
  if (clean.startsWith('tcp/') || clean.startsWith('tcp:')) return 'tcp';
  if (clean.startsWith('udp/') || clean.startsWith('udp:')) return 'udp';
  if (clean.startsWith('quic/') || clean.startsWith('quic:')) return 'quic';
  if (clean.startsWith('ws/') || clean.startsWith('ws:')) return 'ws';
  if (clean.startsWith('unix/') || clean.startsWith('unixpipe/')) return 'unix';
  if (isTls) return 'tls';
  if (clean.includes(':7447')) return 'tcp';
  if (clean.includes(':7446')) return 'udp';
  return 'unknown';
}

export function extractLocatorHostPort(locator: string): string {
  if (!locator || typeof locator !== 'string') return '';
  const clean = locator.trim();
  if (clean.startsWith('unixpipe/')) {
    return clean.replace(/^unixpipe\/?/, '');
  }
  const parts = clean.split('/');
  const hostPort = parts.length > 1 ? parts.slice(1).join('/') : clean;
  return hostPort.replace('0.0.0.0', '127.0.0.1');
}

export function isLocatorMatch(loc1: string, loc2: string): boolean {
  if (!loc1 || !loc2) return false;
  const clean1 = loc1.trim();
  const clean2 = loc2.trim();
  if (clean1 === clean2) return true;

  const proto1 = extractLocatorProtocol(clean1);
  const proto2 = extractLocatorProtocol(clean2);
  if (proto1 !== proto2 && proto1 !== 'unknown' && proto2 !== 'unknown') {
    return false;
  }

  const hp1 = extractLocatorHostPort(clean1);
  const hp2 = extractLocatorHostPort(clean2);
  if (hp1 === hp2) return true;

  const lastColon1 = hp1.lastIndexOf(':');
  const lastColon2 = hp2.lastIndexOf(':');
  const port1 = lastColon1 !== -1 ? hp1.slice(lastColon1 + 1) : '7447';
  const port2 = lastColon2 !== -1 ? hp2.slice(lastColon2 + 1) : '7447';
  if (port1 !== port2) return false;

  const host1 = (lastColon1 !== -1 ? hp1.slice(0, lastColon1) : hp1).replace(/^\[|\]$/g, '').toLowerCase();
  const host2 = (lastColon2 !== -1 ? hp2.slice(0, lastColon2) : hp2).replace(/^\[|\]$/g, '').toLowerCase();

  const isLocal1 = host1 === '127.0.0.1' || host1 === 'localhost' || host1 === '0.0.0.0' || host1 === '::1' || !host1;
  const isLocal2 = host2 === '127.0.0.1' || host2 === 'localhost' || host2 === '0.0.0.0' || host2 === '::1' || !host2;

  if (isLocal1 && isLocal2) return true;
  return host1 === host2;
}

function sha1(bytes: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const len = bytes.length;
  const wordCount = ((len + 8) >> 6) + 1;
  const words = new Uint32Array(wordCount * 16);
  for (let i = 0; i < len; i++) {
    words[i >> 2] |= bytes[i] << ((3 - (i & 3)) * 8);
  }
  words[len >> 2] |= 0x80 << ((3 - (len & 3)) * 8);
  words[wordCount * 16 - 1] = len * 8;

  const w = new Uint32Array(80);
  for (let i = 0; i < words.length; i += 16) {
    for (let j = 0; j < 16; j++) w[j] = words[i + j];
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (x << 1) | (x >>> 31);
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0);
  outView.setUint32(4, h1);
  outView.setUint32(8, h2);
  outView.setUint32(12, h3);
  outView.setUint32(16, h4);
  return out;
}

const NAMESPACE_OID = new Uint8Array([
  0x6b, 0xa7, 0xb8, 0x12, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

export function derivePersistentZid(profileId: string): string {
  if (!profileId) return '';
  const clean = profileId.replace(/-/g, '').toLowerCase();
  if (/^[0-9a-f]{32}$/.test(clean)) {
    return clean;
  }

  const nameBytes = new TextEncoder().encode(profileId);
  const data = new Uint8Array(NAMESPACE_OID.length + nameBytes.length);
  data.set(NAMESPACE_OID);
  data.set(nameBytes, NAMESPACE_OID.length);

  const hash = sha1(data);
  hash[6] = (hash[6] & 0x0f) | 0x50; // Version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // Variant RFC 4122

  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += hash[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function findMatchingProfile(
  profiles: ConnectionProfile[],
  zidOrNode: {
    id?: string;
    zid?: string;
    locators?: string[];
    connectLocators?: string[];
    profileId?: string;
    label?: string;
  }
): ConnectionProfile | undefined {
  if (!zidOrNode || !profiles || profiles.length === 0) return undefined;

  const rawId = zidOrNode.profileId || zidOrNode.id;
  if (rawId) {
    const cleanId = rawId.replace(/^(profile-|scouted-|admin-)/, '');
    const p = profiles.find(
      (prof) =>
        prof.id === rawId ||
        prof.id === cleanId ||
        prof.id === `profile-${cleanId}`
    );
    if (p) return p;
  }

  const targetZid = (zidOrNode.zid || '').toLowerCase();
  if (targetZid) {
    const byZid = profiles.find((prof) => {
      const cleanProfId = prof.id.replace(/-/g, '').toLowerCase();
      const pZid = derivePersistentZid(prof.id).toLowerCase();
      return cleanProfId === targetZid || prof.id.toLowerCase() === targetZid || pZid === targetZid;
    });
    if (byZid) return byZid;
  }

  const targetLocs = zidOrNode.locators || [];
  if (targetLocs.length > 0) {
    const byLoc = profiles.find((prof) =>
      (prof.listen_locators || []).some((pLoc) =>
        targetLocs.some((tLoc) => isLocatorMatch(tLoc, pLoc))
      )
    );
    if (byLoc) return byLoc;
  }

  const targetConnectLocs = zidOrNode.connectLocators || [];
  if (targetConnectLocs.length > 0) {
    const byConnect = profiles.find((prof) =>
      (prof.connect_locators || []).some((pLoc) =>
        targetConnectLocs.some((tLoc) => isLocatorMatch(tLoc, pLoc))
      )
    );
    if (byConnect) return byConnect;
  }

  if (zidOrNode.label) {
    const byName = profiles.find(
      (prof) => prof.name && prof.name.trim().toLowerCase() === zidOrNode.label?.trim().toLowerCase()
    );
    if (byName) return byName;
  }

  return undefined;
}

export function buildTopologyGraph({
  scoutedNodes = [],
  activeSessions = {},
  profiles = [],
  existingNodes = [],
  customNodeLabels = {},
  adminData,
}: BuildTopologyOptions): TopologyGraphData {
  const nodeMap = new Map<string, TopologyNode>();
  const edges: TopologyEdge[] = [];
  const edgeSet = new Set<string>();

  const findPosition = (zid?: string, id?: string) => {
    if (zid) {
      const cleanZid = zid.toLowerCase();
      const existing = existingNodes.find((n) => n.zid && n.zid.toLowerCase() === cleanZid);
      if (existing) {
        return { x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: existing.fx, fy: existing.fy };
      }
    }
    if (id) {
      const existing = existingNodes.find((n) => n.id === id);
      if (existing) {
        return { x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: existing.fx, fy: existing.fy };
      }
    }
    return undefined;
  };

  const getLabel = (zid: string, fallback: string) => {
    const cleanZid = zid.toLowerCase();
    return customNodeLabels[zid] || customNodeLabels[cleanZid] || fallback;
  };

  // 1. Local Nodes from Active Sessions & Profiles
  const connectedProfiles = profiles.filter((p) => Boolean(activeSessions[p.id]));

  connectedProfiles.forEach((profile, idx) => {
    const sessionInfo = activeSessions[profile.id];
    const zid = sessionInfo?.zid || derivePersistentZid(profile.id);
    if (!zid) return;
    const cleanZid = zid.toLowerCase();

    const mode = (sessionInfo?.mode || profile.mode || 'peer').toLowerCase();
    const type: TopologyNode['type'] = mode === 'router' ? 'router' : mode === 'client' ? 'client' : 'peer';

    const rawListen =
      type === 'client'
        ? []
        : type === 'router'
        ? (profile.listen_locators && profile.listen_locators.length > 0
            ? profile.listen_locators
            : sessionInfo?.listen_locators || ['tcp/0.0.0.0:7447'])
        : sessionInfo?.bound_locators && sessionInfo.bound_locators.length > 0
        ? sessionInfo.bound_locators
        : sessionInfo?.listen_locators || profile.listen_locators || [];

    const locators = type === 'client' ? [] : filterRealLocators(rawListen);
    const connectLocators = sessionInfo?.connect_locators || profile.connect_locators || [];
    const isTls = isTlsEnabled(profile.tls_config, [...locators, ...connectLocators]);
    const pos = findPosition(zid, `profile-${profile.id}`);

    const node: TopologyNode = {
      id: `profile-${profile.id}`,
      zid,
      label: getLabel(zid, profile.name || (type === 'router' ? 'Local Router' : type === 'client' ? 'Edge Client' : 'Local Peer')),
      type,
      status: 'connected',
      scope: 'local',
      locators,
      connectLocators,
      links: sessionInfo?.links || [],
      isTls,
      profileId: profile.id,
      mode,
      connectedRouters: sessionInfo?.connected_routers || [],
      connectedPeers: sessionInfo?.connected_peers || [],
      activeSubscribers: sessionInfo?.active_subscribers ?? 0,
      activeQueryables: sessionInfo?.active_queryables ?? 0,
      uptimeSeconds: sessionInfo?.uptime_seconds ?? 0,
      x: pos ? pos.x : 100 + idx * 80,
      y: pos ? pos.y : 0 + idx * 60,
      vx: pos ? pos.vx : 0,
      vy: pos ? pos.vy : 0,
      fx: pos?.fx ?? null,
      fy: pos?.fy ?? null,
      radius: type === 'router' ? 34 : type === 'peer' ? 28 : 24,
    };
    nodeMap.set(cleanZid, node);
  });

  // Handle active sessions not in profiles array
  Object.entries(activeSessions).forEach(([profileId, sessionInfo], idx) => {
    if (connectedProfiles.some((p) => p.id === profileId)) return;
    const zid = sessionInfo.zid || profileId;
    if (!zid) return;
    const cleanZid = zid.toLowerCase();
    if (nodeMap.has(cleanZid)) return;

    const mode = (sessionInfo.mode || 'router').toLowerCase();
    const type: TopologyNode['type'] = mode === 'router' ? 'router' : mode === 'client' ? 'client' : 'peer';
    const locators = filterRealLocators([
      ...(sessionInfo.bound_locators || []),
      ...(sessionInfo.listen_locators || []),
    ]);
    const pos = findPosition(zid, `profile-${profileId}`);

    const node: TopologyNode = {
      id: `profile-${profileId}`,
      zid,
      label: getLabel(zid, `Active Node (${zid.slice(0, 6)})`),
      type,
      status: 'connected',
      scope: 'local',
      locators,
      connectLocators: sessionInfo.connect_locators || [],
      links: sessionInfo.links || [],
      isTls: isTlsEnabled(null, [...locators, ...(sessionInfo.connect_locators || [])]),
      profileId,
      mode,
      connectedRouters: sessionInfo.connected_routers || [],
      connectedPeers: sessionInfo.connected_peers || [],
      activeSubscribers: sessionInfo.active_subscribers ?? 0,
      activeQueryables: sessionInfo.active_queryables ?? 0,
      uptimeSeconds: sessionInfo.uptime_seconds ?? 0,
      x: pos ? pos.x : 160 + idx * 60,
      y: pos ? pos.y : -80 + idx * 60,
      vx: pos ? pos.vx : 0,
      vy: pos ? pos.vy : 0,
      fx: pos?.fx ?? null,
      fy: pos?.fy ?? null,
      radius: type === 'router' ? 34 : type === 'peer' ? 28 : 24,
    };
    nodeMap.set(cleanZid, node);
  });

  // 2. Remote Scouted Nodes
  scoutedNodes.forEach((scout, idx) => {
    if (!scout.zid) return;
    const cleanZid = scout.zid.toLowerCase();

    // Skip disconnected local profile sessions
    const matchingProf = findMatchingProfile(profiles, scout);
    if (matchingProf && !activeSessions[matchingProf.id]) {
      const pZid = derivePersistentZid(matchingProf.id).toLowerCase();
      if (cleanZid === pZid || cleanZid === matchingProf.id.toLowerCase()) {
        return;
      }
      if (
        matchingProf.listen_locators &&
        matchingProf.listen_locators.length > 0 &&
        scout.locators &&
        scout.locators.length > 0 &&
        scout.locators.every((l) =>
          matchingProf.listen_locators!.some((pLoc) => isLocatorMatch(l, pLoc))
        )
      ) {
        return;
      }
    }

    let existing = nodeMap.get(cleanZid);
    if (existing) {
      if (scout.locators && scout.locators.length > 0) {
        existing.locators = filterRealLocators(
          Array.from(new Set([...existing.locators, ...scout.locators]))
        );
      }
      return;
    }

    const what = (scout.what || '').toLowerCase();
    const type: TopologyNode['type'] = what.includes('router') ? 'router' : what.includes('client') ? 'client' : 'peer';
    const locators = filterRealLocators(scout.locators || []);
    const isTls = locators.some((l) => extractLocatorProtocol(l) === 'tls');
    const pos = findPosition(scout.zid, `scouted-${scout.zid}`);
    const shortZid = scout.zid.length > 8 ? `${scout.zid.slice(0, 4)}...${scout.zid.slice(-4)}` : scout.zid;

    const minArc = 85;
    const spawnRadius = Math.max(180, (scoutedNodes.length * minArc) / (2 * Math.PI));
    const angle = (idx / Math.max(1, scoutedNodes.length)) * 2 * Math.PI;
    const dist = spawnRadius + (idx % 2 === 0 ? 0 : 35);

    const node: TopologyNode = {
      id: `scouted-${scout.zid}`,
      zid: scout.zid,
      label: getLabel(scout.zid, matchingProf?.name || `${scout.what || 'Node'} (${shortZid})`),
      type,
      status: 'scouted',
      scope: 'remote',
      locators,
      connectLocators: [],
      links: [],
      isTls,
      profileId: matchingProf?.id,
      mode: type,
      connectedRouters: [],
      connectedPeers: [],
      activeSubscribers: 0,
      activeQueryables: 0,
      uptimeSeconds: 0,
      x: pos ? pos.x : Math.cos(angle) * dist,
      y: pos ? pos.y : Math.sin(angle) * dist,
      vx: pos ? pos.vx : 0,
      vy: pos ? pos.vy : 0,
      fx: pos?.fx ?? null,
      fy: pos?.fy ?? null,
      radius: type === 'router' ? 34 : type === 'peer' ? 28 : 24,
    };
    nodeMap.set(cleanZid, node);
  });

  // 3. Remote Connected Nodes from Authoritative Live Sessions
  Object.values(activeSessions).forEach((sessionInfo) => {
    if (sessionInfo.links) {
      sessionInfo.links.forEach((link) => {
        if (!link.zid) return;
        const cleanZid = link.zid.toLowerCase();
        let targetNode = nodeMap.get(cleanZid);
        const rawWhat = (link.whatami || 'router').toLowerCase();
        const nodeType: TopologyNode['type'] = rawWhat === 'peer' ? 'peer' : rawWhat === 'client' ? 'client' : 'router';
        const validLinkLocators =
          nodeType !== 'client' && link.dst && !isEphemeralPortLocator(link.dst) ? [link.dst] : [];

        if (!targetNode) {
          const isTls = extractLocatorProtocol(link.dst) === 'tls';
          const pos = findPosition(link.zid, `link-${cleanZid}`);
          const shortZid = link.zid.length > 8 ? `${link.zid.slice(0, 4)}...${link.zid.slice(-4)}` : link.zid;
          targetNode = {
            id: `link-${cleanZid}`,
            zid: link.zid,
            label: getLabel(link.zid, `${rawWhat === 'router' ? 'Connected Router' : rawWhat === 'client' ? 'Connected Client' : 'Connected Peer'} (${shortZid})`),
            type: nodeType,
            status: 'connected',
            scope: 'remote',
            locators: filterRealLocators(validLinkLocators),
            connectLocators: [],
            links: [link],
            isTls,
            mode: nodeType,
            connectedRouters: [],
            connectedPeers: [],
            activeSubscribers: 0,
            activeQueryables: 0,
            uptimeSeconds: 0,
            x: pos ? pos.x : 320,
            y: pos ? pos.y : -80,
            vx: pos ? pos.vx : 0,
            vy: pos ? pos.vy : 0,
            fx: pos?.fx ?? null,
            fy: pos?.fy ?? null,
            radius: nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24,
          };
          nodeMap.set(cleanZid, targetNode);
        } else {
          targetNode.status = 'connected';
          if (validLinkLocators.length > 0) {
            targetNode.locators = filterRealLocators(
              Array.from(new Set([...targetNode.locators, ...validLinkLocators]))
            );
          }
          if (!targetNode.links) targetNode.links = [];
          if (!targetNode.links.some((l) => l.src === link.src && l.dst === link.dst)) {
            targetNode.links.push(link);
          }
        }
      });
    }

    if (sessionInfo.connected_routers) {
      sessionInfo.connected_routers.forEach((rZid) => {
        if (!rZid) return;
        const cleanZid = rZid.toLowerCase();
        let targetRouter = nodeMap.get(cleanZid);
        if (!targetRouter) {
          const pos = findPosition(rZid, `remote-router-${cleanZid}`);
          const shortZid = rZid.length > 8 ? `${rZid.slice(0, 4)}...${rZid.slice(-4)}` : rZid;
          targetRouter = {
            id: `remote-router-${cleanZid}`,
            zid: rZid,
            label: getLabel(rZid, `Upstream Router (${shortZid})`),
            type: 'router',
            status: 'connected',
            scope: 'remote',
            locators: [],
            connectLocators: [],
            links: [],
            isTls: false,
            mode: 'router',
            connectedRouters: [],
            connectedPeers: [],
            activeSubscribers: 0,
            activeQueryables: 0,
            uptimeSeconds: 0,
            x: pos ? pos.x : 320,
            y: pos ? pos.y : -80,
            vx: pos ? pos.vx : 0,
            vy: pos ? pos.vy : 0,
            fx: pos?.fx ?? null,
            fy: pos?.fy ?? null,
            radius: 34,
          };
          nodeMap.set(cleanZid, targetRouter);
        } else {
          targetRouter.status = 'connected';
        }
      });
    }

    if (sessionInfo.connected_peers) {
      sessionInfo.connected_peers.forEach((pZid) => {
        if (!pZid) return;
        const cleanZid = pZid.toLowerCase();
        let targetPeer = nodeMap.get(cleanZid);
        if (!targetPeer) {
          const pos = findPosition(pZid, `remote-peer-${cleanZid}`);
          const shortZid = pZid.length > 8 ? `${pZid.slice(0, 4)}...${pZid.slice(-4)}` : pZid;
          targetPeer = {
            id: `remote-peer-${cleanZid}`,
            zid: pZid,
            label: getLabel(pZid, `Connected Peer (${shortZid})`),
            type: 'peer',
            status: 'connected',
            scope: 'remote',
            locators: [],
            connectLocators: [],
            links: [],
            isTls: false,
            mode: 'peer',
            connectedRouters: [],
            connectedPeers: [],
            activeSubscribers: 0,
            activeQueryables: 0,
            uptimeSeconds: 0,
            x: pos ? pos.x : -120,
            y: pos ? pos.y : 80,
            vx: pos ? pos.vx : 0,
            vy: pos ? pos.vy : 0,
            fx: pos?.fx ?? null,
            fy: pos?.fy ?? null,
            radius: 28,
          };
          nodeMap.set(cleanZid, targetPeer);
        } else {
          targetPeer.status = 'connected';
        }
      });
    }
  });

  // 4. Remote Admin Space Nodes (@/**)
  if (adminData && adminData.nodes) {
    const admNodes = adminData.nodes instanceof Map ? Array.from(adminData.nodes.values()) : Array.isArray(adminData.nodes) ? adminData.nodes : [];
    admNodes.forEach((admNode: any) => {
      if (!admNode.zid) return;
      const cleanZid = admNode.zid.toLowerCase();
      let existing = nodeMap.get(cleanZid);
      if (existing) {
        existing.status = 'connected';
        if (admNode.locators && admNode.locators.length > 0) {
          const incomingLocs = existing.scope === 'local'
            ? admNode.locators
            : filterRealLocators(admNode.locators);
          existing.locators = Array.from(
            new Set([...existing.locators, ...incomingLocs])
          );
        }
        if (admNode.connectLocators && admNode.connectLocators.length > 0) {
          const incomingConnects = existing.scope === 'local'
            ? admNode.connectLocators
            : filterRealLocators(admNode.connectLocators);
          existing.connectLocators = Array.from(
            new Set([...(existing.connectLocators || []), ...incomingConnects])
          );
        }
        if (admNode.links) {
          existing.links = [...(existing.links || []), ...admNode.links];
        }
        return;
      }

      const type: TopologyNode['type'] = admNode.whatami || 'peer';
      const pos = findPosition(admNode.zid, `admin-${admNode.zid}`);
      const shortZid = admNode.zid.length > 8 ? `${admNode.zid.slice(0, 4)}...${admNode.zid.slice(-4)}` : admNode.zid;

      const node: TopologyNode = {
        id: `admin-${admNode.zid}`,
        zid: admNode.zid,
        label: getLabel(admNode.zid, `Remote ${type} (${shortZid})`),
        type,
        status: 'connected',
        scope: 'remote',
        locators: filterRealLocators(admNode.locators || []),
        connectLocators: filterRealLocators(admNode.connectLocators || []),
        links: admNode.links || [],
        isTls: (admNode.locators || []).some((l: string) => extractLocatorProtocol(l) === 'tls'),
        mode: type,
        connectedRouters: [],
        connectedPeers: [],
        activeSubscribers: 0,
        activeQueryables: 0,
        uptimeSeconds: 0,
        x: pos ? pos.x : 260,
        y: pos ? pos.y : 80,
        vx: pos ? pos.vx : 0,
        vy: pos ? pos.vy : 0,
        fx: pos?.fx ?? null,
        fy: pos?.fy ?? null,
        radius: type === 'router' ? 34 : type === 'peer' ? 28 : 24,
      };
      nodeMap.set(cleanZid, node);
    });
  }

  // 5. Authoritative Live Edges
  const addEdge = (src: TopologyNode, dst: TopologyNode, status: 'active' | 'scouted', locator?: string) => {
    if (!src || !dst || src.id === dst.id || src.zid.toLowerCase() === dst.zid.toLowerCase()) return;
    const sorted = [src.id, dst.id].sort();
    const key = `${sorted[0]}<->${sorted[1]}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);

    const isEncrypted = src.isTls || dst.isTls;
    const loc = locator || src.locators[0] || dst.locators[0] || '';
    const protocol = extractLocatorProtocol(loc, isEncrypted);

    edges.push({
      id: key,
      source: src.id,
      target: dst.id,
      protocol: protocol === 'unknown' ? (isEncrypted ? 'tls' : 'tcp') : protocol,
      locator: loc || 'tcp',
      status,
      isEncrypted,
      animated: status === 'active',
      isExact: true,
    });
  };

  Object.values(activeSessions).forEach((sessionInfo) => {
    if (!sessionInfo.zid) return;
    const srcNode = nodeMap.get(sessionInfo.zid.toLowerCase());
    if (!srcNode) return;

    if (sessionInfo.links) {
      sessionInfo.links.forEach((link) => {
        if (!link.zid) return;
        const targetNode = nodeMap.get(link.zid.toLowerCase());
        if (targetNode) {
          addEdge(srcNode, targetNode, 'active', link.dst);
        }
      });
    }

    if (sessionInfo.connected_routers) {
      sessionInfo.connected_routers.forEach((rZid) => {
        const targetRouter = nodeMap.get(rZid.toLowerCase());
        if (targetRouter) {
          addEdge(srcNode, targetRouter, 'active');
        }
      });
    }

    if (sessionInfo.connected_peers) {
      sessionInfo.connected_peers.forEach((pZid) => {
        const targetPeer = nodeMap.get(pZid.toLowerCase());
        if (targetPeer) {
          addEdge(srcNode, targetPeer, 'active');
        }
      });
    }
  });

  if (adminData && adminData.links) {
    adminData.links.forEach((link) => {
      let srcNode = link.sourceZid ? nodeMap.get(link.sourceZid.toLowerCase()) : undefined;
      let dstNode = link.targetZid ? nodeMap.get(link.targetZid.toLowerCase()) : undefined;

      if (!srcNode && link.srcLocator) {
        for (const candidate of nodeMap.values()) {
          if (candidate.locators.some((loc) => isLocatorMatch(loc, link.srcLocator!))) {
            srcNode = candidate;
            break;
          }
        }
      }

      if (!dstNode && link.dstLocator) {
        for (const candidate of nodeMap.values()) {
          if (candidate.locators.some((loc) => isLocatorMatch(loc, link.dstLocator!))) {
            dstNode = candidate;
            break;
          }
        }
      }

      if (srcNode && dstNode) {
        addEdge(srcNode, dstNode, 'active', link.dstLocator || link.srcLocator);
      }
    });
  }

  if (adminData && adminData.nodes) {
    const admNodes = adminData.nodes instanceof Map ? Array.from(adminData.nodes.values()) : Array.isArray(adminData.nodes) ? adminData.nodes : [];
    admNodes.forEach((admNode: any) => {
      if (!admNode.zid || !Array.isArray(admNode.neighbors)) return;
      const srcNode = nodeMap.get(admNode.zid.toLowerCase());
      if (!srcNode) return;
      admNode.neighbors.forEach((nbrZid: string) => {
        const dstNode = nodeMap.get(nbrZid.toLowerCase());
        if (dstNode) {
          addEdge(srcNode, dstNode, 'active');
        }
      });
    });
  }

  // Populate connectedRouters and connectedPeers on all nodes from graph edges
  edges.forEach((edge) => {
    let sNode: TopologyNode | undefined;
    let tNode: TopologyNode | undefined;
    for (const node of nodeMap.values()) {
      if (node.id === edge.source) sNode = node;
      if (node.id === edge.target) tNode = node;
      if (sNode && tNode) break;
    }
    if (sNode && tNode) {
      sNode.connectedRouters = sNode.connectedRouters || [];
      sNode.connectedPeers = sNode.connectedPeers || [];
      tNode.connectedRouters = tNode.connectedRouters || [];
      tNode.connectedPeers = tNode.connectedPeers || [];

      if (tNode.type === 'router') {
        if (!sNode.connectedRouters.includes(tNode.zid)) sNode.connectedRouters.push(tNode.zid);
      } else {
        if (!sNode.connectedPeers.includes(tNode.zid)) sNode.connectedPeers.push(tNode.zid);
      }
      if (sNode.type === 'router') {
        if (!tNode.connectedRouters.includes(sNode.zid)) tNode.connectedRouters.push(sNode.zid);
      } else {
        if (!tNode.connectedPeers.includes(sNode.zid)) tNode.connectedPeers.push(sNode.zid);
      }
    }
  });

  const nodes = Array.from(nodeMap.values()).filter(
    (n) =>
      Boolean(n.zid && typeof n.zid === 'string' && n.zid.trim().length > 0) &&
      !n.zid.toLowerCase().includes('linkstate') &&
      !n.zid.toLowerCase().includes('link_state') &&
      !n.zid.toLowerCase().includes('link-state')
  );
  return { nodes, edges };
}
