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

export function extractLocatorProtocol(locator: string): TopologyProtocol {
  if (!locator || typeof locator !== 'string') return 'unknown';
  const prefix = locator.split('/')[0]?.toLowerCase();
  switch (prefix) {
    case 'tcp':
      return 'tcp';
    case 'tls':
      return 'tls';
    case 'udp':
      return 'udp';
    case 'quic':
      return 'quic';
    case 'ws':
    case 'websocket':
      return 'ws';
    case 'unix':
      return 'unix';
    default:
      return 'unknown';
  }
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
  if (lastColon1 === -1 || lastColon2 === -1) return false;

  const port1 = hostPort1.slice(lastColon1 + 1);
  const port2 = hostPort2.slice(lastColon2 + 1);
  const host1 = hostPort1.slice(0, lastColon1).replace(/^\[|\]$/g, '').toLowerCase();
  const host2 = hostPort2.slice(0, lastColon2).replace(/^\[|\]$/g, '').toLowerCase();

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

export function buildTopologyGraph({
  scoutedNodes,
  activeSessions,
  profiles,
  existingNodes = [],
}: BuildTopologyOptions): TopologyGraphData {
  const existingMap = new Map<string, TopologyNode>(existingNodes.map((n) => [n.id, n]));
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  const matchedScoutZids = new Set<string>();

  // 1. Process Saved Connection Profiles as Persistent Nodes
  profiles.forEach((profile, index) => {
    const nodeId = `profile-${profile.id}`;
    const existing = existingMap.get(nodeId);

    const isConnected = Boolean(activeSessions[profile.id]);
    const sessionZid = activeSessions[profile.id]?.zid;
    const persistentZid = sessionZid || derivePersistentZid(profile.id);

    // Find if a scouted node matches this profile by ZID or locators
    const matchingScout = scoutedNodes.find((scout) => {
      if (profile.mode === 'client') {
        return profile.connect_locators.some((loc) =>
          (scout.locators || []).some((scoutLoc) => isLocatorMatch(scoutLoc, loc))
        );
      }
      if (scout.zid === sessionZid || scout.zid === persistentZid) return true;
      return profile.connect_locators.some((loc) =>
        (scout.locators || []).some((scoutLoc) => isLocatorMatch(scoutLoc, loc))
      );
    });

    if (matchingScout) {
      matchedScoutZids.add(matchingScout.zid);
    }

    const type: TopologyNode['type'] = profile.mode === 'client' ? 'router' : 'peer';
    const locators =
      matchingScout?.locators?.length
        ? matchingScout.locators
        : profile.connect_locators.length
        ? profile.connect_locators
        : profile.listen_locators.length
        ? profile.listen_locators
        : [];

    const isTls =
      locators.some((l) => extractLocatorProtocol(l) === 'tls') ||
      Boolean(profile.tls_config);

    const radius = type === 'router' ? 34 : 28;
    const defaultX = 180 + index * 60;
    const defaultY = -120 + index * 60;

    const topologyNode: TopologyNode = {
      id: nodeId,
      zid: matchingScout?.zid || sessionZid || persistentZid,
      label: profile.name,
      type,
      status: isConnected ? 'connected' : matchingScout ? 'scouted' : 'disconnected',
      locators,
      isTls,
      profileId: profile.id,
      x: existing ? existing.x : defaultX,
      y: existing ? existing.y : defaultY,
      vx: existing ? existing.vx : 0,
      vy: existing ? existing.vy : 0,
      fx: existing?.fx ?? null,
      fy: existing?.fy ?? null,
      radius,
    };
    nodes.push(topologyNode);
  });

  // 2. Process Additional External Scouted Nodes (e.g. unknown external routers/peers on LAN)
  scoutedNodes.forEach((node, index) => {
    if (matchedScoutZids.has(node.zid)) return;

    // If this scouted node is an active client-mode session inside ZenohX, skip it
    const isLocalClientSession = profiles.some(
      (prof) => prof.mode === 'client' && activeSessions[prof.id]?.zid === node.zid
    );
    if (isLocalClientSession) return;

    const nodeId = `scouted-${node.zid}`;
    const existing = existingMap.get(nodeId);

    const isTls = (node.locators || []).some(
      (loc) => extractLocatorProtocol(loc) === 'tls'
    );

    const whatLower = (node.what || '').toLowerCase();
    const type: TopologyNode['type'] = whatLower.includes('router')
      ? 'router'
      : whatLower.includes('peer')
      ? 'peer'
      : 'client';

    const shortZid =
      node.zid.length > 8 ? `${node.zid.substring(0, 4)}...${node.zid.slice(-4)}` : node.zid;
    const label = `${node.what || 'Node'} (${shortZid})`;

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
    nodes.push(topologyNode);
  });

  // 3. Generate Inter-Node Topology Edges
  const routers = nodes.filter((n) => n.type === 'router');
  const peersAndClients = nodes.filter((n) => n.type !== 'router');

  if (routers.length > 0) {
    // Interconnect peers and clients to routers
    routers.forEach((router) => {
      peersAndClients.forEach((peer) => {
        const edgeId = `${router.id}<->${peer.id}`;
        const primaryLoc = router.locators[0] || peer.locators[0] || '';
        let protocol = extractLocatorProtocol(primaryLoc);
        if (protocol === 'unknown') {
          protocol = 'mesh';
        }
        edges.push({
          id: edgeId,
          source: router.id,
          target: peer.id,
          protocol,
          locator: primaryLoc || 'auto/mesh',
          status: router.status === 'connected' || peer.status === 'connected' ? 'active' : 'scouted',
          isEncrypted: router.isTls || peer.isTls,
          animated: router.status === 'connected' || peer.status === 'connected',
        });
      });
    });
  } else if (nodes.length > 1) {
    // Pure peer-to-peer mesh between all peers
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        const primaryLoc = n1.locators[0] || n2.locators[0] || '';
        let protocol = extractLocatorProtocol(primaryLoc);
        if (protocol === 'unknown') {
          protocol = 'mesh';
        }
        edges.push({
          id: `${n1.id}<->${n2.id}`,
          source: n1.id,
          target: n2.id,
          protocol,
          locator: primaryLoc || 'auto/mesh',
          status: n1.status === 'connected' || n2.status === 'connected' ? 'active' : 'scouted',
          isEncrypted: n1.isTls || n2.isTls,
          animated: n1.status === 'connected' || n2.status === 'connected',
        });
      }
    }
  }

  return { nodes, edges };
}
