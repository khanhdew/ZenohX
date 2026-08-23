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

export function buildTopologyGraph({
  scoutedNodes,
  activeSessions,
  profiles,
  existingNodes = [],
}: BuildTopologyOptions): TopologyGraphData {
  const existingMap = new Map<string, TopologyNode>(existingNodes.map((n) => [n.id, n]));
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  const activeProfileList = profiles.filter((p) => Boolean(activeSessions[p.id]));
  const matchedProfileIds = new Set<string>();

  // 1. Process Scouted Nodes
  scoutedNodes.forEach((node, index) => {
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

    // Check if this scouted node matches any connected profile
    const matchedConnectedProfile = activeProfileList.find((prof) =>
      prof.connect_locators.some((loc) =>
        (node.locators || []).some(
          (scoutLoc) => scoutLoc === loc || extractLocatorHostPort(scoutLoc) === extractLocatorHostPort(loc)
        )
      )
    );

    if (matchedConnectedProfile) {
      matchedProfileIds.add(matchedConnectedProfile.id);
    }

    const matchedAnyProfile = profiles.find((prof) =>
      prof.connect_locators.some((loc) =>
        (node.locators || []).some(
          (scoutLoc) => scoutLoc === loc || extractLocatorHostPort(scoutLoc) === extractLocatorHostPort(loc)
        )
      )
    );

    const isConnected = Boolean(matchedConnectedProfile);
    const shortZid =
      node.zid.length > 8 ? `${node.zid.substring(0, 4)}...${node.zid.slice(-4)}` : node.zid;
    const label = matchedAnyProfile ? matchedAnyProfile.name : `${node.what || 'Node'} (${shortZid})`;

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
      status: isConnected ? 'connected' : 'scouted',
      locators: node.locators || [],
      isTls,
      profileId: matchedAnyProfile?.id,
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

  // 2. Unmatched Active Sessions (e.g. connected remote/cloud routers or peers)
  activeProfileList.forEach((profile, index) => {
    if (matchedProfileIds.has(profile.id)) return;

    const nodeId = `profile-${profile.id}`;
    const existing = existingMap.get(nodeId);

    const type: TopologyNode['type'] = profile.mode === 'client' ? 'router' : 'peer';
    const isTls = profile.connect_locators.some((loc) => extractLocatorProtocol(loc) === 'tls');
    const radius = type === 'router' ? 34 : 28;

    const defaultX = 180 + index * 60;
    const defaultY = -120 + index * 60;

    const topologyNode: TopologyNode = {
      id: nodeId,
      zid: `remote-${profile.id}`,
      label: profile.name,
      type,
      status: 'connected',
      locators: profile.connect_locators,
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

  // 3. Generate Inter-Node Topology Edges
  const routers = nodes.filter((n) => n.type === 'router');
  const peersAndClients = nodes.filter((n) => n.type !== 'router');

  if (routers.length > 0) {
    // Interconnect peers and clients to routers
    routers.forEach((router) => {
      peersAndClients.forEach((peer) => {
        const edgeId = `${router.id}<->${peer.id}`;
        const primaryLoc = router.locators[0] || peer.locators[0] || '';
        const protocol = extractLocatorProtocol(primaryLoc);
        edges.push({
          id: edgeId,
          source: router.id,
          target: peer.id,
          protocol,
          locator: primaryLoc,
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
        const protocol = extractLocatorProtocol(primaryLoc);
        edges.push({
          id: `${n1.id}<->${n2.id}`,
          source: n1.id,
          target: n2.id,
          protocol,
          locator: primaryLoc,
          status: n1.status === 'connected' || n2.status === 'connected' ? 'active' : 'scouted',
          isEncrypted: n1.isTls || n2.isTls,
          animated: n1.status === 'connected' || n2.status === 'connected',
        });
      }
    }
  }

  return { nodes, edges };
}
