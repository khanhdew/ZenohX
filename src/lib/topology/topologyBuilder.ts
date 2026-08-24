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
import { isTlsEnabled } from '../tls';

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
  const parts = locator.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : locator;
}

export function isLocatorMatch(loc1: string, loc2: string): boolean {
  if (!loc1 || !loc2) return false;
  if (loc1 === loc2) return true;
  const hostPort1 = extractLocatorHostPort(loc1);
  const hostPort2 = extractLocatorHostPort(loc2);
  if (hostPort1 === hostPort2) return true;

  const lastColon1 = hostPort1.lastIndexOf(':');
  const lastColon2 = hostPort2.lastIndexOf(':');

  const port1 = lastColon1 !== -1 ? hostPort1.slice(lastColon1 + 1) : '7447';
  const port2 = lastColon2 !== -1 ? hostPort2.slice(lastColon2 + 1) : '7447';
  const host1 = (lastColon1 !== -1 ? hostPort1.slice(0, lastColon1) : hostPort1).replace(/^\[|\]$/g, '').toLowerCase();
  const host2 = (lastColon2 !== -1 ? hostPort2.slice(0, lastColon2) : hostPort2).replace(/^\[|\]$/g, '').toLowerCase();

  if (port1 === port2) {
    const isLocal1 = host1 === '127.0.0.1' || host1 === 'localhost' || host1 === '0.0.0.0' || host1 === '::1' || host1 === '';
    const isLocal2 = host2 === '127.0.0.1' || host2 === 'localhost' || host2 === '0.0.0.0' || host2 === '::1' || host2 === '';
    if (isLocal1 || isLocal2 || host1 === host2) return true;
  }
  return false;
}

export function derivePersistentZid(profileId: string): string {
  const clean = profileId.replace(/-/g, '').toLowerCase();
  if (/^[0-9a-f]{32}$/.test(clean)) {
    return clean;
  }
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) {
    hash = (hash << 5) - hash + profileId.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex}${hex}${hex}${hex}`.substring(0, 32);
}

/**
 * Finds an existing saved ConnectionProfile matching a given Node/ZID/locator
 * to prevent creating duplicate profiles.
 */
export function findMatchingProfile(
  profiles: ConnectionProfile[],
  zidOrNode: { zid: string; locators?: string[]; profileId?: string }
): ConnectionProfile | undefined {
  if (!zidOrNode || !profiles || profiles.length === 0) return undefined;
  if (zidOrNode.profileId) {
    const p = profiles.find((prof) => prof.id === zidOrNode.profileId);
    if (p) return p;
  }
  const targetZid = zidOrNode.zid;
  const targetLocators = zidOrNode.locators || [];

  return profiles.find((prof) => {
    const pZid = derivePersistentZid(prof.id);
    if (pZid === targetZid) return true;
    return (prof.connect_locators || []).some((loc: string) =>
      targetLocators.some((nLoc) => isLocatorMatch(nLoc, loc))
    );
  });
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
    const listenLocs = [
      ...(sessionInfo?.listen_locators || []),
      ...profile.listen_locators,
    ];
    const locators = Array.from(new Set(listenLocs)).filter(Boolean);

    // Outbound Target Endpoints (Upstreams / Connect Locators)
    const connectLocs = [
      ...(sessionInfo?.connect_locators || []),
      ...profile.connect_locators,
    ];
    const connectLocators = Array.from(new Set(connectLocs)).filter(Boolean);

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
    zenohxZids.add(sessionZid.toLowerCase());

    if (!zidNodeMap.has(sessionZid)) {
      const nodeId = `profile-${profileId}`;
      const existing = existingMap.get(nodeId) || existingMap.get(`scouted-${sessionZid}`);
      const rawMode = (sessionInfo.mode || 'peer').toLowerCase();
      const type: TopologyNode['type'] =
        rawMode === 'router' ? 'router' : rawMode === 'client' ? 'client' : 'peer';
      const locators = Array.from(new Set(sessionInfo.listen_locators || [])).filter(Boolean);
      const connectLocators = Array.from(new Set(sessionInfo.connect_locators || [])).filter(Boolean);
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
    // Exclude any node that belongs to ZenohX
    if (zenohxZids.has(scoutZid) || zidNodeMap.has(node.zid)) {
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
      locators: node.locators || [],
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
        if (!zidNodeMap.has(linkZid) && !zidNodeMap.has(lowerZid)) {
          const shortZid =
            linkZid.length > 8
              ? `${linkZid.substring(0, 4)}...${linkZid.slice(-4)}`
              : linkZid;
          const nodeId = `link-${linkZid}`;
          const existing = existingMap.get(nodeId);
          const rawWhat = (link.whatami || 'router').toLowerCase();
          const nodeType: TopologyNode['type'] =
            rawWhat === 'peer' ? 'peer' : rawWhat === 'client' ? 'client' : 'router';
          const isTls = extractLocatorProtocol(link.dst) === 'tls';
          const topologyNode: TopologyNode = {
            id: nodeId,
            zid: linkZid,
            label: `${rawWhat === 'router' ? 'Connected Router' : rawWhat === 'client' ? 'Connected Client' : 'Connected Peer'} (${shortZid})`,
            type: nodeType,
            status: 'connected',
            locators: [link.dst],
            isTls,
            x: existing ? existing.x : 320,
            y: existing ? existing.y : -80,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
            fx: existing?.fx ?? null,
            fy: existing?.fy ?? null,
            radius: nodeType === 'router' ? 34 : nodeType === 'peer' ? 28 : 24,
          };
          zidNodeMap.set(linkZid, topologyNode);
        }
      });
    }

    // Also ensure any connected_routers / connected_peers from routers_zid() / peers_zid() are mapped
    if (sessionInfo.connected_routers && sessionInfo.connected_routers.length > 0) {
      sessionInfo.connected_routers.forEach((rZid) => {
        const lowerZid = rZid.toLowerCase();
        if (!zidNodeMap.has(rZid) && !zidNodeMap.has(lowerZid)) {
          const shortZid =
            rZid.length > 8 ? `${rZid.substring(0, 4)}...${rZid.slice(-4)}` : rZid;
          const nodeId = `remote-router-${rZid}`;
          const existing = existingMap.get(nodeId);
          const topologyNode: TopologyNode = {
            id: nodeId,
            zid: rZid,
            label: `Upstream Router (${shortZid})`,
            type: 'router',
            status: 'connected',
            locators: [],
            isTls: false,
            x: existing ? existing.x : 320,
            y: existing ? existing.y : -80,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
            fx: existing?.fx ?? null,
            fy: existing?.fy ?? null,
            radius: 34,
          };
          zidNodeMap.set(rZid, topologyNode);
        }
      });
    }

    if (sessionInfo.connected_peers && sessionInfo.connected_peers.length > 0) {
      sessionInfo.connected_peers.forEach((pZid) => {
        const lowerZid = pZid.toLowerCase();
        if (!zidNodeMap.has(pZid) && !zidNodeMap.has(lowerZid)) {
          const shortZid =
            pZid.length > 8 ? `${pZid.substring(0, 4)}...${pZid.slice(-4)}` : pZid;
          const nodeId = `remote-peer-${pZid}`;
          const existing = existingMap.get(nodeId);
          const topologyNode: TopologyNode = {
            id: nodeId,
            zid: pZid,
            label: `Connected Peer (${shortZid})`,
            type: 'peer',
            status: 'connected',
            locators: [],
            isTls: false,
            x: existing ? existing.x : -120,
            y: existing ? existing.y : 80,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
            fx: existing?.fx ?? null,
            fy: existing?.fy ?? null,
            radius: 28,
          };
          zidNodeMap.set(pZid, topologyNode);
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
