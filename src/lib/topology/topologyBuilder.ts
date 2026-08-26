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
  if (clean.startsWith('tls/') || clean.startsWith('tls:') || clean.startsWith('tls://') || clean.startsWith('wss/')) return 'tls';
  if (clean.startsWith('tcp/') || clean.startsWith('tcp:') || clean.startsWith('tcp://')) return 'tcp';
  if (clean.startsWith('udp/') || clean.startsWith('udp:') || clean.startsWith('udp://')) return 'udp';
  if (clean.startsWith('quic/') || clean.startsWith('quic:') || clean.startsWith('quic://')) return 'quic';
  if (clean.startsWith('ws/') || clean.startsWith('ws:') || clean.startsWith('ws://') || clean.startsWith('websocket/')) return 'ws';
  if (clean.startsWith('unix/') || clean.startsWith('unix:') || clean.startsWith('unix://')) return 'unix';

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
  // Protocols must match if both are known
  if (proto1 !== proto2 && proto1 !== 'unknown' && proto2 !== 'unknown') {
    return false;
  }

  const hostPort1 = extractLocatorHostPort(clean1);
  const hostPort2 = extractLocatorHostPort(clean2);
  if (hostPort1 === hostPort2) return true;

  if (proto1 === 'unix' || proto2 === 'unix') {
    return hostPort1 === hostPort2;
  }

  const lastColon1 = hostPort1.lastIndexOf(':');
  const lastColon2 = hostPort2.lastIndexOf(':');

  const port1 = lastColon1 !== -1 ? hostPort1.slice(lastColon1 + 1) : '7447';
  const port2 = lastColon2 !== -1 ? hostPort2.slice(lastColon2 + 1) : '7447';

  if (port1 !== port2) {
    return false;
  }

  const host1 = (lastColon1 !== -1 ? hostPort1.slice(0, lastColon1) : hostPort1)
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  const host2 = (lastColon2 !== -1 ? hostPort2.slice(0, lastColon2) : hostPort2)
    .replace(/^\[|\]$/g, '')
    .toLowerCase();

  if (host1 === host2) {
    return true;
  }

  const isLocal1 =
    host1 === '127.0.0.1' ||
    host1 === 'localhost' ||
    host1 === '0.0.0.0' ||
    host1 === '::1' ||
    host1 === '';
  const isLocal2 =
    host2 === '127.0.0.1' ||
    host2 === 'localhost' ||
    host2 === '0.0.0.0' ||
    host2 === '::1' ||
    host2 === '';

  // ONLY match if BOTH are local loopback / wildcard variations
  if (isLocal1 && isLocal2) {
    return true;
  }

  return false;
}

export function isSameEndpoint(loc1: string, loc2: string): boolean {
  if (!loc1 || !loc2) return false;
  const hp1 = extractLocatorHostPort(loc1);
  const hp2 = extractLocatorHostPort(loc2);
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

  // Derive UUID v5 matching Rust backend: uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, pid.as_bytes())
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

/**
 * Finds an existing saved ConnectionProfile matching a given Node/ZID/locator
 * to prevent creating duplicate profiles in storage.
 */
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

  // 1. Direct profileId or id match (with or without 'profile-' or 'scouted-' prefix)
  const rawId = zidOrNode.profileId || zidOrNode.id;
  if (rawId) {
    const cleanId = rawId.replace(/^(profile-|scouted-)/, '');
    const p = profiles.find(
      (prof) =>
        prof.id === rawId ||
        prof.id === cleanId ||
        prof.id === `profile-${cleanId}` ||
        prof.id === `scouted-${cleanId}`
    );
    if (p) return p;
  }

  const targetZid = (zidOrNode.zid || '').toLowerCase();
  const targetLocators = zidOrNode.locators || [];
  const targetConnectLocs = zidOrNode.connectLocators || [];
  const allTargetLocs = [...targetLocators, ...targetConnectLocs];

  // 2. Direct ID or persistent ZID match
  if (targetZid) {
    const byZid = profiles.find((prof) => {
      if (prof.id.toLowerCase() === targetZid) return true;
      const cleanProfId = prof.id.replace(/^(profile-|scouted-)/, '').toLowerCase();
      if (cleanProfId === targetZid) return true;
      const pZid = derivePersistentZid(prof.id).toLowerCase();
      return pZid === targetZid;
    });
    if (byZid) return byZid;
  }

  // 3. Match listen locators first (authoritative node ownership)
  if (targetLocators.length > 0) {
    const byListen = profiles.find((prof) => {
      const profLocs = prof.listen_locators || [];
      return profLocs.some((pLoc) =>
        targetLocators.some((tLoc) => isLocatorMatch(tLoc, pLoc))
      );
    });
    if (byListen) return byListen;
  }

  // 3b. Match connect locators if connect locators specifically passed
  if (targetConnectLocs.length > 0) {
    const byConnect = profiles.find((prof) => {
      const profLocs = prof.connect_locators || [];
      return profLocs.some((pLoc) =>
        targetConnectLocs.some((tLoc) => isLocatorMatch(tLoc, pLoc))
      );
    });
    if (byConnect) return byConnect;
  }

  // 3c. Fallback bidirectional locator match
  if (allTargetLocs.length > 0) {
    const byLocator = profiles.find((prof) => {
      const profAllLocs = [...(prof.connect_locators || []), ...(prof.listen_locators || [])];
      return profAllLocs.some((pLoc) =>
        allTargetLocs.some((tLoc) => isLocatorMatch(tLoc, pLoc))
      );
    });
    if (byLocator) return byLocator;
  }

  // 4. Exact name match if label provided
  if (zidOrNode.label) {
    const byName = profiles.find(
      (prof) => prof.name && prof.name.trim().toLowerCase() === zidOrNode.label?.trim().toLowerCase()
    );
    if (byName) return byName;
  }

  return undefined;
}

export function cleanConnectLocators(locators?: string[]): string[] {
  if (!Array.isArray(locators)) return [];
  return Array.from(
    new Set(
      locators
        .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
        .map((l) => l.trim())
    )
  );
}

export function buildTopologyGraph({
  scoutedNodes,
  activeSessions,
  profiles,
  existingNodes = [],
  customNodeLabels = {},
  adminData,
}: BuildTopologyOptions): TopologyGraphData {
  // Map keyed strictly by lowercase ZID to guarantee 1:1 mapping between ZID and node
  const nodeMap = new Map<string, TopologyNode>();
  const edges: TopologyEdge[] = [];

  const findExistingPosition = (
    zid?: string,
    id?: string,
    locators?: string[]
  ): { x: number; y: number; vx: number; vy: number; fx: number | null; fy: number | null } | undefined => {
    if (zid) {
      const cleanZid = zid.toLowerCase();
      const byZid = existingNodes.find((n) => n.zid && n.zid.toLowerCase() === cleanZid);
      if (byZid) {
        return { x: byZid.x, y: byZid.y, vx: byZid.vx, vy: byZid.vy, fx: byZid.fx ?? null, fy: byZid.fy ?? null };
      }
    }
    if (id) {
      const byId = existingNodes.find((n) => n.id === id);
      if (byId) {
        return { x: byId.x, y: byId.y, vx: byId.vx, vy: byId.vy, fx: byId.fx ?? null, fy: byId.fy ?? null };
      }
    }
    if (locators && locators.length > 0) {
      const byLoc = existingNodes.find(
        (n) => n.locators && n.locators.some((l) => locators.some((tL) => isLocatorMatch(l, tL) || isSameEndpoint(l, tL)))
      );
      if (byLoc) {
        return { x: byLoc.x, y: byLoc.y, vx: byLoc.vx, vy: byLoc.vy, fx: byLoc.fx ?? null, fy: byLoc.fy ?? null };
      }
    }
    return undefined;
  };

  const getCustomLabel = (zid?: string, id?: string): string | undefined => {
    if (!zid && !id) return undefined;
    const cleanZid = (zid || '').toLowerCase();
    return (
      (zid && customNodeLabels[zid]) ||
      (cleanZid && customNodeLabels[cleanZid]) ||
      (id && customNodeLabels[id]) ||
      (cleanZid && customNodeLabels[`scouted-${cleanZid}`]) ||
      (cleanZid && customNodeLabels[`profile-${cleanZid}`]) ||
      (cleanZid && customNodeLabels[`admin-${cleanZid}`])
    );
  };

  // 1. Process Active Sessions & Profiles (Local App Nodes)
  const connectedProfiles = profiles.filter((p) => Boolean(activeSessions[p.id]));

  connectedProfiles.forEach((profile, index) => {
    const sessionInfo = activeSessions[profile.id];
    const rawMode = (sessionInfo?.mode || profile.mode || 'peer').toLowerCase();
    const nodeType: TopologyNode['type'] =
      rawMode === 'router' ? 'router' : rawMode === 'client' ? 'client' : 'peer';
    const sessionZid = sessionInfo?.zid || derivePersistentZid(profile.id);
    const cleanZid = sessionZid.toLowerCase();

    // Router locators must always remain static as configured in profile (or session listen_locators).
    // They must never mutate to dynamic OS bound addresses or ephemeral ports.
    const rawListen =
      nodeType === 'client'
        ? []
        : nodeType === 'router'
        ? (profile.listen_locators && profile.listen_locators.length > 0
            ? profile.listen_locators
            : sessionInfo?.listen_locators && sessionInfo.listen_locators.length > 0
            ? sessionInfo.listen_locators
            : ['tcp/0.0.0.0:7447'])
        : sessionInfo?.bound_locators && sessionInfo.bound_locators.length > 0
        ? sessionInfo.bound_locators
        : sessionInfo?.listen_locators || profile.listen_locators || [];

    const locators =
      nodeType === 'client'
        ? []
        : filterRealLocators(Array.from(new Set(rawListen)));

    const connectLocators = cleanConnectLocators([
      ...(sessionInfo?.connect_locators || []),
      ...(profile.connect_locators || []),
    ]);

    const nodeId = `profile-${profile.id}`;
    const customName = getCustomLabel(sessionZid, nodeId);
    const isTls = isTlsEnabled(profile.tls_config, [...locators, ...connectLocators]);

    let localNode = nodeMap.get(cleanZid);
    if (localNode) {
      localNode.id = nodeId;
      localNode.status = 'connected';
      localNode.profileId = profile.id;
      localNode.scope = 'local';
      localNode.type = nodeType;
      localNode.mode = rawMode;
      localNode.label = customName || profile.name || localNode.label;
      localNode.connectLocators = connectLocators;
      localNode.locators = filterRealLocators(
        Array.from(new Set([...localNode.locators, ...locators]))
      );
      localNode.links = sessionInfo?.links || localNode.links;
      localNode.connectedRouters = sessionInfo?.connected_routers || localNode.connectedRouters;
      localNode.connectedPeers = sessionInfo?.connected_peers || localNode.connectedPeers;
      localNode.activeSubscribers = sessionInfo?.active_subscribers ?? localNode.activeSubscribers;
      localNode.activeQueryables = sessionInfo?.active_queryables ?? localNode.activeQueryables;
      localNode.uptimeSeconds = sessionInfo?.uptime_seconds ?? localNode.uptimeSeconds;
      localNode.radius = nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24;
      if (isTls) localNode.isTls = true;
    } else {
      const existingPos = findExistingPosition(sessionZid, nodeId, [...locators, ...connectLocators]);
      localNode = {
        id: nodeId,
        zid: sessionZid,
        label:
          customName ||
          profile.name ||
          (nodeType === 'client' ? 'Edge Client' : nodeType === 'router' ? 'Local Router' : 'Local Peer'),
        type: nodeType,
        status: 'connected',
        scope: 'local',
        locators,
        connectLocators,
        links: sessionInfo?.links || [],
        isTls,
        profileId: profile.id,
        mode: rawMode,
        connectedRouters: sessionInfo?.connected_routers || [],
        connectedPeers: sessionInfo?.connected_peers || [],
        activeSubscribers: sessionInfo?.active_subscribers ?? 0,
        activeQueryables: sessionInfo?.active_queryables ?? 0,
        uptimeSeconds: sessionInfo?.uptime_seconds ?? 0,
        x: existingPos ? existingPos.x : 140 + index * 60,
        y: existingPos ? existingPos.y : -80 + index * 60,
        vx: existingPos ? existingPos.vx : 0,
        vy: existingPos ? existingPos.vy : 0,
        fx: existingPos?.fx ?? null,
        fy: existingPos?.fy ?? null,
        radius: nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24,
      };
      nodeMap.set(cleanZid, localNode);
    }
  });

  // Handle any activeSessions not in profiles array
  Object.entries(activeSessions).forEach(([profileId, sessionInfo], index) => {
    if (connectedProfiles.some((p) => p.id === profileId)) return;
    const sessionZid = sessionInfo.zid || profileId;
    if (!sessionZid) return;
    const cleanZid = sessionZid.toLowerCase();

    let targetNode = nodeMap.get(cleanZid);
    if (targetNode) {
      targetNode.status = 'connected';
      targetNode.profileId = profileId;
      targetNode.scope = 'local';
    } else {
      const nodeId = `profile-${profileId}`;
      const existingPos = findExistingPosition(sessionZid, nodeId);
      const rawMode = (sessionInfo.mode || 'router').toLowerCase();
      const nodeType: TopologyNode['type'] =
        rawMode === 'router' ? 'router' : rawMode === 'client' ? 'client' : 'peer';
      const locs = filterRealLocators([
        ...(sessionInfo.bound_locators || []),
        ...(sessionInfo.listen_locators || []),
      ]);

      const node: TopologyNode = {
        id: nodeId,
        zid: sessionZid,
        label: `Active Node (${sessionZid.slice(0, 6)})`,
        type: nodeType,
        status: 'connected',
        scope: 'local',
        locators: locs,
        connectLocators: cleanConnectLocators(sessionInfo.connect_locators),
        links: sessionInfo.links || [],
        isTls: isTlsEnabled(null, [...locs, ...(sessionInfo.connect_locators || [])]),
        profileId,
        mode: rawMode,
        connectedRouters: sessionInfo.connected_routers || [],
        connectedPeers: sessionInfo.connected_peers || [],
        activeSubscribers: sessionInfo.active_subscribers ?? 0,
        activeQueryables: sessionInfo.active_queryables ?? 0,
        uptimeSeconds: sessionInfo.uptime_seconds ?? 0,
        x: existingPos ? existingPos.x : 180 + index * 60,
        y: existingPos ? existingPos.y : -120 + index * 60,
        vx: existingPos ? existingPos.vx : 0,
        vy: existingPos ? existingPos.vy : 0,
        fx: existingPos?.fx ?? null,
        fy: existingPos?.fy ?? null,
        radius: nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24,
      };
      nodeMap.set(cleanZid, node);
    }
  });

  // 2. Process Scouted Network Nodes
  scoutedNodes.forEach((node, index) => {
    const scoutZid = (node.zid || '').toLowerCase();
    if (!scoutZid) return;

    // Filter out inactive local profile sessions (prevent stopped local app nodes from appearing as remote nodes)
    const matchingProf = findMatchingProfile(profiles, node);
    if (matchingProf && !activeSessions[matchingProf.id]) {
      const pZid = derivePersistentZid(matchingProf.id).toLowerCase();
      const profId = matchingProf.id.toLowerCase();
      if (scoutZid === pZid || scoutZid === profId || (node.zid && node.zid.toLowerCase() === pZid)) {
        return; // Stopped local app node
      }
      if (
        matchingProf.listen_locators &&
        matchingProf.listen_locators.length > 0 &&
        node.locators &&
        node.locators.length > 0 &&
        node.locators.every((l) =>
          matchingProf.listen_locators.some((pLoc) => isLocatorMatch(l, pLoc))
        )
      ) {
        return; // Stale listen advertisement from stopped local node
      }
    }

    const existingScout = nodeMap.get(scoutZid);
    if (existingScout) {
      existingScout.locators = filterRealLocators(
        Array.from(new Set([...existingScout.locators, ...(node.locators || [])]))
      );
      if ((node.locators || []).some((loc) => extractLocatorProtocol(loc) === 'tls')) {
        existingScout.isTls = true;
      }
      return;
    }

    const nodeId = `scouted-${node.zid}`;
    const existingPos = findExistingPosition(node.zid, nodeId, node.locators);

    const isTls = (node.locators || []).some((loc) => extractLocatorProtocol(loc) === 'tls');
    const whatLower = (node.what || '').toLowerCase();
    const type: TopologyNode['type'] = whatLower.includes('router')
      ? 'router'
      : whatLower.includes('peer')
      ? 'peer'
      : 'client';

    const customLabel = getCustomLabel(node.zid, nodeId);
    const shortZid =
      node.zid.length > 8 ? `${node.zid.substring(0, 4)}...${node.zid.slice(-4)}` : node.zid;
    const label =
      customLabel || matchingProf?.name || `${node.what || 'External Node'} (${shortZid})`;

    const radius = type === 'router' ? 34 : type === 'peer' ? 28 : 24;
    const angle = (index / Math.max(1, scoutedNodes.length)) * 2 * Math.PI;
    const distance = 160 + (index % 2) * 50;
    const defaultX = Math.cos(angle) * distance;
    const defaultY = Math.sin(angle) * distance;

    const topologyNode: TopologyNode = {
      id: nodeId,
      zid: node.zid,
      label,
      type,
      status: 'scouted',
      scope: 'remote',
      locators: filterRealLocators(node.locators || []),
      isTls,
      profileId: matchingProf?.id,
      x: existingPos ? existingPos.x : defaultX,
      y: existingPos ? existingPos.y : defaultY,
      vx: existingPos ? existingPos.vx : 0,
      vy: existingPos ? existingPos.vy : 0,
      fx: existingPos?.fx ?? null,
      fy: existingPos?.fy ?? null,
      radius,
    };
    nodeMap.set(scoutZid, topologyNode);
  });

  // 3. Process Authoritative Links and Connected Routers/Peers from Active Sessions
  Object.values(activeSessions).forEach((sessionInfo) => {
    if (sessionInfo.links && sessionInfo.links.length > 0) {
      sessionInfo.links.forEach((link) => {
        if (!link.zid) return;
        const linkZid = link.zid;
        const cleanZid = linkZid.toLowerCase();
        let targetNode = nodeMap.get(cleanZid);

        const scoutMatch = scoutedNodes.find((s) => s.zid.toLowerCase() === cleanZid);
        const profMatch = findMatchingProfile(profiles, { zid: linkZid, locators: [link.dst] });
        const rawWhat = (link.whatami || 'router').toLowerCase();
        const isClientNode = rawWhat === 'client';
        // Never treat ephemeral client socket ports (e.g. 44331) as advertised node listen locators
        const validLinkLocators =
          !isClientNode && link.dst && !isEphemeralPortLocator(link.dst) ? [link.dst] : [];

        const combinedLocators = Array.from(
          new Set([
            ...validLinkLocators,
            ...(scoutMatch?.locators || []),
            ...(profMatch?.listen_locators || []),
          ])
        ).filter(Boolean);

        if (!targetNode) {
          const shortZid =
            linkZid.length > 8
              ? `${linkZid.substring(0, 4)}...${linkZid.slice(-4)}`
              : linkZid;
          const nodeId = `link-${cleanZid}`;
          const existingPos = findExistingPosition(linkZid, nodeId, combinedLocators);
          const nodeType: TopologyNode['type'] =
            rawWhat === 'peer' ? 'peer' : rawWhat === 'client' ? 'client' : 'router';
          const isTls = extractLocatorProtocol(link.dst) === 'tls' || Boolean(profMatch?.tls_config);
          const customName = getCustomLabel(linkZid, nodeId);

          targetNode = {
            id: nodeId,
            zid: linkZid,
            label:
              customName ||
              profMatch?.name ||
              (scoutMatch?.what
                ? `${scoutMatch.what} (${shortZid})`
                : `${rawWhat === 'router' ? 'Connected Router' : rawWhat === 'client' ? 'Connected Client' : 'Connected Peer'} (${shortZid})`),
            type: nodeType,
            status: 'connected',
            scope: 'remote',
            locators: nodeType === 'client' ? [] : filterRealLocators(combinedLocators).filter((loc) => !isEphemeralPortLocator(loc)),
            connectLocators: profMatch?.connect_locators || [],
            links: [link],
            isTls,
            profileId: profMatch?.id,
            x: existingPos ? existingPos.x : 320,
            y: existingPos ? existingPos.y : -80,
            vx: existingPos ? existingPos.vx : 0,
            vy: existingPos ? existingPos.vy : 0,
            fx: existingPos?.fx ?? null,
            fy: existingPos?.fy ?? null,
            radius: nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24,
          };
          nodeMap.set(cleanZid, targetNode);
        } else {
          targetNode.status = 'connected';
          if (targetNode.type !== 'client' && combinedLocators.length > 0) {
            targetNode.locators = filterRealLocators(
              Array.from(new Set([...targetNode.locators, ...combinedLocators]))
            ).filter((loc) => !isEphemeralPortLocator(loc));
          }
          if (!targetNode.links) targetNode.links = [];
          if (!targetNode.links.some((l) => l.src === link.src && l.dst === link.dst)) {
            targetNode.links.push(link);
          }
        }
      });
    }

    if (sessionInfo.connected_routers && sessionInfo.connected_routers.length > 0) {
      sessionInfo.connected_routers.forEach((rZid) => {
        if (!rZid) return;
        const cleanZid = rZid.toLowerCase();
        let targetRouter = nodeMap.get(cleanZid);

        const scoutMatch = scoutedNodes.find((s) => s.zid.toLowerCase() === cleanZid);
        const profMatch = findMatchingProfile(profiles, { zid: rZid });
        const routerLocators = Array.from(
          new Set([
            ...(scoutMatch?.locators || []),
            ...(profMatch?.listen_locators || []),
          ])
        ).filter(Boolean);

        if (!targetRouter) {
          const shortZid =
            rZid.length > 8 ? `${rZid.substring(0, 4)}...${rZid.slice(-4)}` : rZid;
          const nodeId = `remote-router-${cleanZid}`;
          const existingPos = findExistingPosition(rZid, nodeId, routerLocators);
          const customName = getCustomLabel(rZid, nodeId);

          targetRouter = {
            id: nodeId,
            zid: rZid,
            label:
              customName ||
              profMatch?.name ||
              (scoutMatch?.what
                ? `${scoutMatch.what} (${shortZid})`
                : `Upstream Router (${shortZid})`),
            type: 'router',
            status: 'connected',
            scope: 'remote',
            locators: filterRealLocators(routerLocators),
            connectLocators: profMatch?.connect_locators || [],
            isTls: isTlsEnabled(profMatch?.tls_config, routerLocators),
            profileId: profMatch?.id,
            x: existingPos ? existingPos.x : 320,
            y: existingPos ? existingPos.y : -80,
            vx: existingPos ? existingPos.vx : 0,
            vy: existingPos ? existingPos.vy : 0,
            fx: existingPos?.fx ?? null,
            fy: existingPos?.fy ?? null,
            radius: 34,
          };
          nodeMap.set(cleanZid, targetRouter);
        } else {
          targetRouter.status = 'connected';
          if (routerLocators.length > 0) {
            targetRouter.locators = filterRealLocators(
              Array.from(new Set([...targetRouter.locators, ...routerLocators]))
            );
          }
        }
      });
    }

    if (sessionInfo.connected_peers && sessionInfo.connected_peers.length > 0) {
      sessionInfo.connected_peers.forEach((pZid) => {
        if (!pZid) return;
        const cleanZid = pZid.toLowerCase();
        let targetPeer = nodeMap.get(cleanZid);

        const scoutMatch = scoutedNodes.find((s) => s.zid.toLowerCase() === cleanZid);
        const profMatch = findMatchingProfile(profiles, { zid: pZid });
        const peerLocators = Array.from(
          new Set([
            ...(scoutMatch?.locators || []),
            ...(profMatch?.listen_locators || []),
          ])
        ).filter(Boolean);

        if (!targetPeer) {
          const shortZid =
            pZid.length > 8 ? `${pZid.substring(0, 4)}...${pZid.slice(-4)}` : pZid;
          const nodeId = `remote-peer-${cleanZid}`;
          const existingPos = findExistingPosition(pZid, nodeId, peerLocators);
          const customName = getCustomLabel(pZid, nodeId);

          targetPeer = {
            id: nodeId,
            zid: pZid,
            label:
              customName ||
              profMatch?.name ||
              (scoutMatch?.what
                ? `${scoutMatch.what} (${shortZid})`
                : `Connected Peer (${shortZid})`),
            type: 'peer',
            status: 'connected',
            scope: 'remote',
            locators: filterRealLocators(peerLocators),
            connectLocators: profMatch?.connect_locators || [],
            isTls: isTlsEnabled(profMatch?.tls_config, peerLocators),
            profileId: profMatch?.id,
            x: existingPos ? existingPos.x : -120,
            y: existingPos ? existingPos.y : 80,
            vx: existingPos ? existingPos.vx : 0,
            vy: existingPos ? existingPos.vy : 0,
            fx: existingPos?.fx ?? null,
            fy: existingPos?.fy ?? null,
            radius: 28,
          };
          nodeMap.set(cleanZid, targetPeer);
        } else {
          targetPeer.status = 'connected';
          if (peerLocators.length > 0) {
            targetPeer.locators = filterRealLocators(
              Array.from(new Set([...targetPeer.locators, ...peerLocators]))
            );
          }
        }
      });
    }
  });

  // 4. Process Admin Space Discovery Data (@/**)
  if (adminData && adminData.nodes) {
    adminData.nodes.forEach((admNode) => {
      if (!admNode.zid) return;
      const cleanZid = admNode.zid.toLowerCase();
      let targetNode = nodeMap.get(cleanZid);

      const profMatch = findMatchingProfile(profiles, { zid: admNode.zid, locators: admNode.locators });

      if (!targetNode) {
        // Skip synthesizing if this matches an inactive local profile
        if (profMatch && !activeSessions[profMatch.id]) {
          return;
        }

        const shortZid =
          admNode.zid.length > 8
            ? `${admNode.zid.substring(0, 4)}...${admNode.zid.slice(-4)}`
            : admNode.zid;
        const nodeId = `admin-${cleanZid}`;
        const existingPos = findExistingPosition(admNode.zid, nodeId, admNode.locators);
        const nodeType: TopologyNode['type'] = admNode.whatami;
        const isTls = (admNode.locators || []).some((l) => extractLocatorProtocol(l) === 'tls');
        const customName = getCustomLabel(admNode.zid, nodeId);

        targetNode = {
          id: nodeId,
          zid: admNode.zid,
          label:
            customName ||
            profMatch?.name ||
            `${nodeType === 'router' ? 'Remote Router' : nodeType === 'peer' ? 'Remote Peer' : 'Remote Client'} (${shortZid})`,
          type: nodeType,
          status: 'connected',
          scope: 'remote',
          locators: filterRealLocators(admNode.locators || []),
          connectLocators: [],
          links: admNode.links || [],
          isTls,
          profileId: profMatch?.id,
          x: existingPos ? existingPos.x : 360,
          y: existingPos ? existingPos.y : 100,
          vx: existingPos ? existingPos.vx : 0,
          vy: existingPos ? existingPos.vy : 0,
          fx: existingPos?.fx ?? null,
          fy: existingPos?.fy ?? null,
          radius: nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24,
        };
        nodeMap.set(cleanZid, targetNode);
      } else {
        if (targetNode.scope !== 'local') {
          targetNode.type = admNode.whatami;
          targetNode.status = 'connected';
        }
        if (admNode.locators && admNode.locators.length > 0) {
          targetNode.locators = filterRealLocators(
            Array.from(new Set([...targetNode.locators, ...admNode.locators]))
          );
        }
        if (admNode.links && admNode.links.length > 0) {
          targetNode.links = [...(targetNode.links || []), ...admNode.links];
        }
      }
    });
  }

  // Filter: ONLY nodes with a valid, non-empty ZID (1 ZID = Exactly 1 Node)
  const nodes = Array.from(nodeMap.values()).filter(
    (n) => Boolean(n.zid && typeof n.zid === 'string' && n.zid.trim().length > 0)
  );

  // 5. Generate Inter-Node Topology Edges (Authoritative live connections only)
  const edgeSet = new Set<string>();

  const addEdge = (
    n1: TopologyNode,
    n2: TopologyNode,
    isExact: boolean,
    status: 'active' | 'scouted',
    overrideLocator?: string
  ) => {
    if (!n1 || !n2 || n1.id === n2.id || n1.zid.toLowerCase() === n2.zid.toLowerCase()) return;
    const sortedIds = [n1.id, n2.id].sort();
    const edgeKey = `${sortedIds[0]}<->${sortedIds[1]}`;
    if (edgeSet.has(edgeKey)) return;
    edgeSet.add(edgeKey);

    const isEncrypted = n1.isTls || n2.isTls;
    const matchingLoc = n2.locators.find((l) =>
      n1.locators.some((rLoc) => isLocatorMatch(l, rLoc))
    );
    const primaryLoc = overrideLocator || matchingLoc || n1.locators[0] || n2.locators[0] || '';
    let protocol = extractLocatorProtocol(primaryLoc, isEncrypted);
    if (protocol === 'unknown') {
      protocol = isEncrypted ? 'tls' : 'tcp';
    }

    edges.push({
      id: edgeKey,
      source: n1.id,
      target: n2.id,
      protocol,
      locator: primaryLoc || 'auto/tcp',
      status,
      isEncrypted,
      animated: status === 'active',
      isExact,
    });
  };

  // Authoritative links from Rust session.info().links()
  Object.values(activeSessions).forEach((sessionInfo) => {
    const sessionNode = sessionInfo.zid ? nodeMap.get(sessionInfo.zid.toLowerCase()) : undefined;
    if (!sessionNode) return;

    if (sessionInfo.links && sessionInfo.links.length > 0) {
      sessionInfo.links.forEach((link) => {
        if (!link.zid) return;
        const targetNode = nodeMap.get(link.zid.toLowerCase());
        if (targetNode) {
          addEdge(sessionNode, targetNode, true, 'active', link.dst);
        }
      });
    }
  });

  // Exact live connections from Zenoh session.info().routers_zid() / peers_zid()
  nodes.forEach((node) => {
    if (node.connectedRouters && node.connectedRouters.length > 0) {
      node.connectedRouters.forEach((routerZid) => {
        const targetRouter = nodeMap.get(routerZid.toLowerCase());
        if (targetRouter) {
          addEdge(node, targetRouter, true, 'active');
        }
      });
    }
    if (node.connectedPeers && node.connectedPeers.length > 0) {
      node.connectedPeers.forEach((peerZid) => {
        const targetPeer = nodeMap.get(peerZid.toLowerCase());
        if (targetPeer) {
          addEdge(node, targetPeer, true, 'active');
        }
      });
    }
  });

  // Inter-Node edges from Admin Space discovery (@/**)
  if (adminData) {
    if (adminData.links && adminData.links.length > 0) {
      adminData.links.forEach((link) => {
        if (!link.sourceZid) return;
        const srcNode = nodeMap.get(link.sourceZid.toLowerCase());
        const dstNode = link.targetZid
          ? nodeMap.get(link.targetZid.toLowerCase())
          : nodes.find((n) => n.locators.some((l) => isLocatorMatch(l, link.dstLocator)));

        if (srcNode && dstNode) {
          addEdge(srcNode, dstNode, true, 'active', link.dstLocator);
        }
      });
    }

    if (adminData.nodes) {
      adminData.nodes.forEach((admNode) => {
        if (!admNode.zid) return;
        const nodeA = nodeMap.get(admNode.zid.toLowerCase());
        if (!nodeA) return;

        admNode.neighbors.forEach((nbrZid) => {
          if (!nbrZid) return;
          const nodeB = nodeMap.get(nbrZid.toLowerCase());
          if (nodeB) {
            addEdge(nodeA, nodeB, true, 'active');
          }
        });
      });
    }
  }

  // Final Pass: Ensure custom labels are attached
  nodes.forEach((n) => {
    const custom = getCustomLabel(n.zid, n.id);
    if (custom) {
      n.label = custom;
    }
  });

  return { nodes, edges };
}
