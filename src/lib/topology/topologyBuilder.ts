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
import { isTlsEnabled, filterRealLocators } from '../tls';

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

  // 3. Connect/Listen locators bidirectional match
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

export function buildTopologyGraph({
  scoutedNodes,
  activeSessions,
  profiles,
  existingNodes = [],
}: BuildTopologyOptions): TopologyGraphData {
  const existingMap = new Map<string, TopologyNode>(existingNodes.map((n) => [n.id, n]));
  const zidNodeMap = new Map<string, TopologyNode>();
  const zenohxZids = new Set<string>();
  const edges: TopologyEdge[] = [];

  // 1. Process ZenohX Sessions & Profiles (Node info comes directly from Rust backend)
  profiles.forEach((profile, index) => {
    const isConnected = Boolean(activeSessions[profile.id]);
    const sessionInfo = activeSessions[profile.id];
    const sessionZid = sessionInfo?.zid;
    const persistentZid = sessionZid || derivePersistentZid(profile.id);

    // Track all internal ZenohX ZIDs to ensure scout never duplicates or alters them
    if (sessionZid) zenohxZids.add(sessionZid.toLowerCase());
    zenohxZids.add(persistentZid.toLowerCase());

    // If not connected, do not display offline saved profile on the graph
    if (!isConnected) {
      return;
    }

    const nodeZid = sessionZid || persistentZid;
    const nodeId = `profile-${profile.id}`;
    const existing = existingMap.get(nodeId) || existingMap.get(`scouted-${nodeZid}`);

    // Authoritative Type and Mode from Rust Session / Profile
    const rawMode = (sessionInfo?.mode || profile.mode || 'peer').toLowerCase();
    const type: TopologyNode['type'] =
      rawMode === 'router' ? 'router' : rawMode === 'client' ? 'client' : 'peer';

    // Authoritative Listen Locators (Advertised Endpoints)
    const rawListen =
      sessionInfo?.bound_locators && sessionInfo.bound_locators.length > 0
        ? sessionInfo.bound_locators
        : sessionInfo?.listen_locators && sessionInfo.listen_locators.length > 0
        ? sessionInfo.listen_locators
        : profile.listen_locators || [];

    const locators = filterRealLocators(
      Array.from(new Set(rawListen))
        .filter(Boolean)
        .filter((loc) => !loc.endsWith(':0') || !(sessionInfo?.bound_locators && sessionInfo.bound_locators.length > 0))
        .map((loc) => (loc.includes('0.0.0.0') ? loc.replace('0.0.0.0', '127.0.0.1') : loc))
    );

    // Outbound Target Endpoints (Upstreams / Connect Locators)
    const connectLocs = [
      ...(sessionInfo?.connect_locators || []),
      ...profile.connect_locators,
    ];
    const connectLocators = filterRealLocators(
      Array.from(new Set(connectLocs))
        .filter(Boolean)
        .map((loc) => (loc.includes('0.0.0.0') ? loc.replace('0.0.0.0', '127.0.0.1') : loc))
    );

    const isTls = isTlsEnabled(profile.tls_config, locators.concat(connectLocators));

    const radius = type === 'router' ? 34 : type === 'peer' ? 28 : 24;
    const defaultX = 180 + index * 60;
    const defaultY = -120 + index * 60;

    // Direct metrics from Rust SessionInfo
    const connectedRouters = sessionInfo?.connected_routers || [];
    const connectedPeers = sessionInfo?.connected_peers || [];
    const activeSubscribers = sessionInfo?.active_subscribers ?? 0;
    const activeQueryables = sessionInfo?.active_queryables ?? 0;
    const uptimeSeconds = sessionInfo?.uptime_seconds ?? 0;

    const topologyNode: TopologyNode = {
      id: nodeId,
      zid: nodeZid,
      label: profile.name,
      type,
      status: 'connected',
      locators,
      connectLocators,
      links: sessionInfo?.links || [],
      isTls,
      profileId: profile.id,
      mode: rawMode,
      connectedRouters,
      connectedPeers,
      activeSubscribers,
      activeQueryables,
      uptimeSeconds,
      x: existing ? existing.x : defaultX,
      y: existing ? existing.y : defaultY,
      vx: existing ? existing.vx : 0,
      vy: existing ? existing.vy : 0,
      fx: existing?.fx ?? null,
      fy: existing?.fy ?? null,
      radius,
    };
    zidNodeMap.set(nodeZid, topologyNode);
  });

  // Include any active sessions that might not have a matching profile in profiles array
  Object.entries(activeSessions).forEach(([profileId, sessionInfo], index) => {
    const sessionZid = sessionInfo.zid;
    if (!sessionZid) return;
    zenohxZids.add(sessionZid.toLowerCase());

    if (!zidNodeMap.has(sessionZid)) {
      const nodeId = `profile-${profileId}`;
      const existing = existingMap.get(nodeId) || existingMap.get(`scouted-${sessionZid}`);
      const rawMode = (sessionInfo.mode || 'peer').toLowerCase();
      const type: TopologyNode['type'] =
        rawMode === 'router' ? 'router' : rawMode === 'client' ? 'client' : 'peer';
      const rawListen =
        sessionInfo.bound_locators && sessionInfo.bound_locators.length > 0
          ? sessionInfo.bound_locators
          : sessionInfo.listen_locators || [];

      const locators = filterRealLocators(
        Array.from(new Set(rawListen))
          .filter(Boolean)
          .map((loc) => (loc.includes('0.0.0.0') ? loc.replace('0.0.0.0', '127.0.0.1') : loc))
      );

      const connectLocators = filterRealLocators(
        Array.from(new Set(sessionInfo.connect_locators || []))
          .filter(Boolean)
          .map((loc) => (loc.includes('0.0.0.0') ? loc.replace('0.0.0.0', '127.0.0.1') : loc))
      );
      const isTls = isTlsEnabled(null, locators.concat(connectLocators));
      const radius = type === 'router' ? 34 : type === 'peer' ? 28 : 24;

      const topologyNode: TopologyNode = {
        id: nodeId,
        zid: sessionZid,
        label: `Active Session (${sessionZid.substring(0, 6)})`,
        type,
        status: 'connected',
        locators,
        connectLocators,
        links: sessionInfo.links || [],
        isTls,
        profileId,
        mode: rawMode,
        connectedRouters: sessionInfo.connected_routers || [],
        connectedPeers: sessionInfo.connected_peers || [],
        activeSubscribers: sessionInfo.active_subscribers ?? 0,
        activeQueryables: sessionInfo.active_queryables ?? 0,
        uptimeSeconds: sessionInfo.uptime_seconds ?? 0,
        x: existing ? existing.x : 180 + index * 60,
        y: existing ? existing.y : -120 + index * 60,
        vx: existing ? existing.vx : 0,
        vy: existing ? existing.vy : 0,
        fx: existing?.fx ?? null,
        fy: existing?.fy ?? null,
        radius,
      };
      zidNodeMap.set(sessionZid, topologyNode);
    }
  });

  // 2. Process ONLY External Nodes (Nodes NOT created with ZenohX) from Scout
  scoutedNodes.forEach((node, index) => {
    const scoutZid = (node.zid || '').toLowerCase();
    const existingNode =
      zidNodeMap.get(node.zid) ||
      Array.from(zidNodeMap.values()).find((n) => n.zid.toLowerCase() === scoutZid);

    // If node already exists, merge the scouted advertised locators into it
    if (existingNode) {
      if (node.locators && node.locators.length > 0) {
        const merged = Array.from(
          new Set([...existingNode.locators, ...filterRealLocators(node.locators)])
        );
        existingNode.locators = merged;
      }
      return;
    }

    if (zenohxZids.has(scoutZid)) {
      return;
    }

    const nodeId = `scouted-${node.zid}`;
    const existing = existingMap.get(nodeId);

    const isTls = (node.locators || []).some((loc) => extractLocatorProtocol(loc) === 'tls');

    const whatLower = (node.what || '').toLowerCase();
    const type: TopologyNode['type'] = whatLower.includes('router')
      ? 'router'
      : whatLower.includes('peer')
      ? 'peer'
      : 'client';

    const shortZid =
      node.zid.length > 8 ? `${node.zid.substring(0, 4)}...${node.zid.slice(-4)}` : node.zid;
    const label = `${node.what || 'External Node'} (${shortZid})`;

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
      locators: filterRealLocators(node.locators || []),
      isTls,
      x: existing ? existing.x : defaultX,
      y: existing ? existing.y : defaultY,
      vx: existing ? existing.vx : 0,
      vy: existing ? existing.vy : 0,
      fx: existing?.fx ?? null,
      fy: existing?.fy ?? null,
      radius,
    };
    zidNodeMap.set(node.zid, topologyNode);
  });

  // 3. Process authoritative links from Rust SessionInfo (session.info().links() & transports())
  Object.values(activeSessions).forEach((sessionInfo) => {
    if (sessionInfo.links && sessionInfo.links.length > 0) {
      sessionInfo.links.forEach((link) => {
        const linkZid = link.zid;
        const lowerZid = linkZid.toLowerCase();
        let targetNode =
          zidNodeMap.get(linkZid) ||
          zidNodeMap.get(lowerZid) ||
          Array.from(zidNodeMap.values()).find((n) => n.zid.toLowerCase() === lowerZid);

        const scoutMatch = scoutedNodes.find((s) => s.zid.toLowerCase() === lowerZid);
        const profMatch = findMatchingProfile(profiles, { zid: linkZid, locators: [link.dst] });

        const combinedLocators = Array.from(
          new Set([
            link.dst,
            ...(scoutMatch?.locators || []),
            ...(profMatch?.listen_locators || []),
          ])
        ).filter(Boolean);

        if (!targetNode) {
          const shortZid =
            linkZid.length > 8
              ? `${linkZid.substring(0, 4)}...${linkZid.slice(-4)}`
              : linkZid;
          const nodeId = `link-${linkZid}`;
          const existing = existingMap.get(nodeId);
          const rawWhat = (link.whatami || 'router').toLowerCase();
          const nodeType: TopologyNode['type'] =
            rawWhat === 'peer' ? 'peer' : rawWhat === 'client' ? 'client' : 'router';
          const isTls = extractLocatorProtocol(link.dst) === 'tls' || Boolean(profMatch?.tls_config);
          targetNode = {
            id: nodeId,
            zid: linkZid,
            label:
              profMatch?.name ||
              (scoutMatch?.what
                ? `${scoutMatch.what} (${shortZid})`
                : `${rawWhat === 'router' ? 'Connected Router' : rawWhat === 'client' ? 'Connected Client' : 'Connected Peer'} (${shortZid})`),
            type: nodeType,
            status: 'connected',
            locators: filterRealLocators(combinedLocators),
            connectLocators: profMatch?.connect_locators || [],
            isTls,
            profileId: profMatch?.id,
            x: existing ? existing.x : 320,
            y: existing ? existing.y : -80,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
            fx: existing?.fx ?? null,
            fy: existing?.fy ?? null,
            radius: nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24,
          };
          zidNodeMap.set(linkZid, targetNode);
        } else {
          // If node already exists, merge link.dst and scout locators if not client
          if (targetNode.type !== 'client' && combinedLocators.length > 0) {
            targetNode.locators = filterRealLocators(
              Array.from(new Set([...targetNode.locators, ...combinedLocators]))
            );
          }
        }
      });
    }

    // Also ensure any connected_routers / connected_peers from routers_zid() / peers_zid() are mapped
    if (sessionInfo.connected_routers && sessionInfo.connected_routers.length > 0) {
      sessionInfo.connected_routers.forEach((rZid) => {
        const lowerZid = rZid.toLowerCase();
        let targetRouter =
          zidNodeMap.get(rZid) ||
          zidNodeMap.get(lowerZid) ||
          Array.from(zidNodeMap.values()).find((n) => n.zid.toLowerCase() === lowerZid);

        const scoutMatch = scoutedNodes.find((s) => s.zid.toLowerCase() === lowerZid);
        const profMatch = findMatchingProfile(profiles, {
          zid: rZid,
          locators: sessionInfo.connect_locators,
        });

        // Upstream router locators from Client's perspective: connect_locators + scout + profile
        const routerLocators = Array.from(
          new Set([
            ...(sessionInfo.connect_locators || []),
            ...(scoutMatch?.locators || []),
            ...(profMatch?.listen_locators || []),
          ])
        ).filter(Boolean);

        if (!targetRouter) {
          const shortZid =
            rZid.length > 8 ? `${rZid.substring(0, 4)}...${rZid.slice(-4)}` : rZid;
          const nodeId = `remote-router-${rZid}`;
          const existing = existingMap.get(nodeId);
          targetRouter = {
            id: nodeId,
            zid: rZid,
            label:
              profMatch?.name ||
              (scoutMatch?.what
                ? `${scoutMatch.what} (${shortZid})`
                : `Upstream Router (${shortZid})`),
            type: 'router',
            status: 'connected',
            locators: filterRealLocators(routerLocators),
            connectLocators: profMatch?.connect_locators || [],
            isTls: isTlsEnabled(profMatch?.tls_config, routerLocators),
            profileId: profMatch?.id,
            x: existing ? existing.x : 320,
            y: existing ? existing.y : -80,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
            fx: existing?.fx ?? null,
            fy: existing?.fy ?? null,
            radius: 34,
          };
          zidNodeMap.set(rZid, targetRouter);
        } else {
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
        const lowerZid = pZid.toLowerCase();
        let targetPeer =
          zidNodeMap.get(pZid) ||
          zidNodeMap.get(lowerZid) ||
          Array.from(zidNodeMap.values()).find((n) => n.zid.toLowerCase() === lowerZid);

        const scoutMatch = scoutedNodes.find((s) => s.zid.toLowerCase() === lowerZid);
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
          const nodeId = `remote-peer-${pZid}`;
          const existing = existingMap.get(nodeId);
          targetPeer = {
            id: nodeId,
            zid: pZid,
            label:
              profMatch?.name ||
              (scoutMatch?.what
                ? `${scoutMatch.what} (${shortZid})`
                : `Connected Peer (${shortZid})`),
            type: 'peer',
            status: 'connected',
            locators: filterRealLocators(peerLocators),
            connectLocators: profMatch?.connect_locators || [],
            isTls: isTlsEnabled(profMatch?.tls_config, peerLocators),
            profileId: profMatch?.id,
            x: existing ? existing.x : -120,
            y: existing ? existing.y : 80,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
            fx: existing?.fx ?? null,
            fy: existing?.fy ?? null,
            radius: 28,
          };
          zidNodeMap.set(pZid, targetPeer);
        } else {
          if (peerLocators.length > 0) {
            targetPeer.locators = filterRealLocators(
              Array.from(new Set([...targetPeer.locators, ...peerLocators]))
            );
          }
        }
      });
    }
  });

  const nodes = Array.from(zidNodeMap.values());

  // 4. Generate Inter-Node Topology Edges (Strict Mode: Real verified connections only)
  const edgeSet = new Set<string>();

  const addEdge = (
    n1: TopologyNode,
    n2: TopologyNode,
    isExact: boolean,
    status: 'active' | 'scouted',
    overrideLocator?: string
  ) => {
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
    const sessionNode = sessionInfo.zid ? zidNodeMap.get(sessionInfo.zid) : undefined;
    if (!sessionNode) return;

    if (sessionInfo.links && sessionInfo.links.length > 0) {
      sessionInfo.links.forEach((link) => {
        const targetNode =
          zidNodeMap.get(link.zid) ||
          Array.from(zidNodeMap.values()).find(
            (n) => n.zid.toLowerCase() === link.zid.toLowerCase()
          );
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
        const targetRouter = nodes.find(
          (n) => n.zid === routerZid || n.zid.toLowerCase() === routerZid.toLowerCase()
        );
        if (targetRouter) {
          addEdge(node, targetRouter, true, 'active');
        }
      });
    }
    if (node.connectedPeers && node.connectedPeers.length > 0) {
      node.connectedPeers.forEach((peerZid) => {
        const targetPeer = nodes.find(
          (n) => n.zid === peerZid || n.zid.toLowerCase() === peerZid.toLowerCase()
        );
        if (targetPeer) {
          addEdge(node, targetPeer, true, 'active');
        }
      });
    }
  });

  return { nodes, edges };
}
