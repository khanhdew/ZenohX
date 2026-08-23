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
  const isAnySessionActive = activeProfileList.length > 0;
  const activeProfile = activeProfileList[0];
  const localMode: 'client' | 'peer' = (activeProfile?.mode as 'client' | 'peer') || 'client';

  // 1. Local ZenohX Node
  const localId = 'local-zenohx';
  const existingLocal = existingMap.get(localId);
  const activeSessionEntry = Object.values(activeSessions)[0];

  const localNode: TopologyNode = {
    id: localId,
    zid: activeSessionEntry?.zid || 'local',
    label: isAnySessionActive
      ? localMode === 'peer'
        ? 'ZenohX (Peer Mesh)'
        : 'ZenohX (Client)'
      : 'ZenohX (Disconnected)',
    type: 'local',
    status: isAnySessionActive ? 'connected' : 'disconnected',
    locators: [],
    isTls: false,
    mode: localMode,
    x: existingLocal ? existingLocal.x : 0,
    y: existingLocal ? existingLocal.y : 0,
    vx: existingLocal ? existingLocal.vx : 0,
    vy: existingLocal ? existingLocal.vy : 0,
    fx: existingLocal?.fx ?? null,
    fy: existingLocal?.fy ?? null,
    radius: 32,
  };
  nodes.push(localNode);

  const matchedProfileIds = new Set<string>();

  // 2. Scouted Nodes
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

    // In Peer mode, discovered LAN peers automatically join the local peer mesh
    const isPeerMeshMember = isAnySessionActive && localMode === 'peer' && type === 'peer';
    const isConnected = Boolean(matchedConnectedProfile) || isPeerMeshMember;
    const shortZid =
      node.zid.length > 8 ? `${node.zid.substring(0, 4)}...${node.zid.slice(-4)}` : node.zid;
    const label = matchedAnyProfile ? matchedAnyProfile.name : `${node.what || 'Node'} (${shortZid})`;

    // Radius scaling by node importance
    const radius = type === 'router' ? 34 : type === 'peer' ? 28 : 24;

    // Initial radial placement if not existing
    const angle = (index / Math.max(1, scoutedNodes.length)) * 2 * Math.PI;
    const distance = 180 + (index % 2) * 50;
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

    // If connected router or active peer mesh member, generate edge to local node
    if (isConnected) {
      const primaryLoc = topologyNode.locators[0] || '';
      const protocol = extractLocatorProtocol(primaryLoc);
      edges.push({
        id: `${localId}->${nodeId}`,
        source: localId,
        target: nodeId,
        protocol,
        locator: primaryLoc,
        status: 'active',
        isEncrypted: protocol === 'tls',
        animated: true,
      });
    }
  });

  // 3. Unmatched Active Sessions
  activeProfileList.forEach((profile, index) => {
    if (matchedProfileIds.has(profile.id)) return;

    const nodeId = `profile-${profile.id}`;
    const existing = existingMap.get(nodeId);

    const type = profile.mode === 'client' ? 'router' : 'peer';
    const isTls = profile.connect_locators.some((loc) => extractLocatorProtocol(loc) === 'tls');
    const radius = type === 'router' ? 34 : 28;

    const defaultX = 200 + index * 50;
    const defaultY = -200 + index * 50;

    const topologyNode: TopologyNode = {
      id: nodeId,
      zid: `unknown-${profile.id}`,
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

    const primaryLoc = topologyNode.locators[0] || '';
    const protocol = extractLocatorProtocol(primaryLoc);
    edges.push({
      id: `${localId}->${nodeId}`,
      source: localId,
      target: nodeId,
      protocol,
      locator: primaryLoc,
      status: 'active',
      isEncrypted: protocol === 'tls',
      animated: true,
    });
  });

  return { nodes, edges };
}
