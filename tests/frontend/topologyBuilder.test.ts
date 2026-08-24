import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopologyGraph,
  extractLocatorProtocol,
  extractLocatorHostPort,
  isLocatorMatch,
  findMatchingProfile,
  derivePersistentZid,
} from '../../src/lib/topology/topologyBuilder.ts';
import type { ScoutedNode, ConnectionProfile, ActiveSession } from '../../src/types/zenoh.ts';
import type { TopologyNode } from '../../src/types/topology.ts';

describe('Topology Data Builder', () => {
  it('extracts locator protocols correctly', () => {
    assert.equal(extractLocatorProtocol('tcp/192.168.1.50:7447'), 'tcp');
    assert.equal(extractLocatorProtocol('tls/router.cloud.zenoh.io:443'), 'tls');
    assert.equal(extractLocatorProtocol('udp/10.0.0.1:7447'), 'udp');
    assert.equal(extractLocatorProtocol('quic/127.0.0.1:7447'), 'quic');
    assert.equal(extractLocatorProtocol('192.168.1.50:7447'), 'tcp');
    assert.equal(extractLocatorProtocol('192.168.1.50:7447', true), 'tls');
    assert.equal(extractLocatorProtocol('tls/192.168.1.50:7448'), 'tls');
    assert.equal(extractLocatorProtocol('invalid-format'), 'unknown');
  });

  it('extracts host and port strings from locators', () => {
    assert.equal(extractLocatorHostPort('tcp/192.168.1.50:7447'), '192.168.1.50:7447');
    assert.equal(extractLocatorHostPort('tls/router.cloud.zenoh.io:443'), 'router.cloud.zenoh.io:443');
    assert.equal(extractLocatorHostPort('raw-host'), 'raw-host');
  });

  it('matches locators across localhost representations and rejects remote IP / protocol mismatches', () => {
    assert.equal(isLocatorMatch('tcp/127.0.0.1:7447', 'tcp/localhost:7447'), true);
    assert.equal(isLocatorMatch('tcp/0.0.0.0:7447', 'tcp/127.0.0.1:7447'), true);
    assert.equal(isLocatorMatch('tcp/127.0.0.1:7447', 'tcp/192.168.1.50:7447'), false);
    assert.equal(isLocatorMatch('tcp/192.168.1.50:7447', 'tls/192.168.1.50:7447'), false);
    assert.equal(isLocatorMatch('tcp/10.0.0.1:7447', 'tcp/10.0.0.1:7447'), true);
    assert.equal(isLocatorMatch('tcp/10.0.0.1:7447', 'tcp/10.0.0.1:7448'), false);
  });

  it('builds topology graph with scouted routers/peers and generates router-to-peer edges', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: '0123456789abcdef',
        what: 'Router',
        locators: ['tcp/192.168.1.100:7447', 'tls/192.168.1.100:7446'],
      },
      {
        zid: 'fedcba9876543210',
        what: 'Peer',
        locators: ['udp/192.168.1.105:7447'],
      },
    ];

    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-1',
        name: 'My Router Profile',
        mode: 'router',
        connect_locators: [],
        listen_locators: ['tcp/192.168.1.100:7447', 'tls/192.168.1.100:7446'],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-1': {
        id: 'sess-1',
        profile_id: 'prof-1',
        zid: '0123456789abcdef',
        connected_peers: ['fedcba9876543210'],
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // 2 scouted nodes = 2 nodes (router and peer)
    assert.equal(nodes.length, 2);

    const routerNode = nodes.find((n) => n.zid === '0123456789abcdef');
    assert.ok(routerNode);
    assert.equal(routerNode?.type, 'router');
    assert.equal(routerNode?.isTls, true);
    assert.equal(routerNode?.status, 'connected'); // connected via prof-1

    const peerNode = nodes.find((n) => n.zid === 'fedcba9876543210');
    assert.ok(peerNode);
    assert.equal(peerNode?.type, 'peer');
    assert.equal(peerNode?.isTls, false);
    assert.equal(peerNode?.status, 'scouted');

    // Should create an active edge between router and peer
    assert.equal(edges.length, 1);
    const routerPeerEdge = edges.find(
      (e) => (e.source === routerNode?.id && e.target === peerNode?.id) ||
             (e.target === routerNode?.id && e.source === peerNode?.id)
    );
    assert.ok(routerPeerEdge);
    assert.equal(routerPeerEdge?.status, 'active');
    assert.equal(routerPeerEdge?.animated, true);
    assert.equal(routerPeerEdge?.isExact, true);
  });

  it('preserves existing node positions across graph updates', () => {
    const existingNode: TopologyNode = {
      id: 'scouted-0123456789abcdef',
      zid: '0123456789abcdef',
      label: 'Router (0123...)',
      type: 'router',
      status: 'scouted',
      locators: ['tcp/192.168.1.100:7447'],
      isTls: false,
      x: 350,
      y: 420,
      vx: 0.5,
      vy: -0.2,
      fx: 350,
      fy: 420,
      radius: 30,
    };

    const scoutedNodes: ScoutedNode[] = [
      {
        zid: '0123456789abcdef',
        what: 'Router',
        locators: ['tcp/192.168.1.100:7447'],
      },
    ];

    const { nodes } = buildTopologyGraph({
      scoutedNodes,
      activeSessions: {},
      profiles: [],
      existingNodes: [existingNode],
    });

    const updatedNode = nodes.find((n) => n.id === existingNode.id);
    assert.ok(updatedNode);
    assert.equal(updatedNode?.x, 350);
    assert.equal(updatedNode?.y, 420);
    assert.equal(updatedNode?.fx, 350);
    assert.equal(updatedNode?.fy, 420);
  });

  it('includes non-scouted active sessions in graph', () => {
    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-cloud',
        name: 'Cloud Router',
        mode: 'client',
        connect_locators: ['tls/router.cloud.zenoh.io:443'],
        listen_locators: [],
        scout_multicast: false,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-cloud': {
        id: 'sess-cloud',
        profile_id: 'prof-cloud',
        zid: 'local-zid-001',
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles,
      existingNodes: [],
    });

    assert.equal(nodes.length, 1);
    
    const cloudNode = nodes.find((n) => n.id === 'profile-prof-cloud');
    assert.ok(cloudNode);
    assert.equal(cloudNode?.type, 'router');
    assert.equal(cloudNode?.isTls, true);
    assert.equal(cloudNode?.status, 'connected');
    assert.equal(cloudNode?.label, 'Cloud Router');
  });

  it('does not create speculative edges between unconnected scouted peers in strict mode', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'peer-1',
        what: 'Peer',
        locators: ['udp/192.168.1.55:7447'],
      },
      {
        zid: 'peer-2',
        what: 'Peer',
        locators: ['udp/192.168.1.56:7447'],
      },
    ];

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions: {},
      profiles: [],
      existingNodes: [],
    });

    assert.equal(nodes.length, 2);
    // Strict mode: no edges unless an exact connection is confirmed
    assert.equal(edges.length, 0);
  });

  it('filters out ZenohX own session from scout results and accurately models single local router', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'router-local-zenohd-zid',
        what: 'Router',
        locators: ['tcp/192.168.1.15:7447'],
      },
    ];

    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-local-router',
        name: 'Local Router',
        mode: 'client',
        connect_locators: ['tcp/127.0.0.1:7447'],
        listen_locators: [],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-local-router': {
        id: 'sess-1',
        profile_id: 'prof-local-router',
        zid: 'own-zenohx-client-zid',
        connected_routers: ['router-local-zenohd-zid'],
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // Directly tracks the single local router without creating an extra client node
    assert.equal(nodes.length, 1);
    const routerNode = nodes.find((n) => n.zid === 'router-local-zenohd-zid');
    assert.ok(routerNode);
    assert.equal(routerNode?.status, 'connected');
    assert.equal(routerNode?.type, 'router');
  });


  it('returns empty graph when disconnected with no scouted nodes', () => {
    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions: {},
      profiles: [],
      existingNodes: [],
    });

    assert.equal(nodes.length, 0);
    assert.equal(edges.length, 0);
  });

  it('guarantees zero duplicate ZIDs across multiple scout replies and active profiles', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'duplicate-zid-12345678',
        what: 'Peer',
        locators: ['tcp/192.168.1.50:7447'],
      },
      {
        zid: 'duplicate-zid-12345678',
        what: 'Peer',
        locators: ['udp/192.168.1.50:7447', 'tls/192.168.1.50:7446'],
      },
    ];

    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-dup',
        name: 'My LAN Peer',
        mode: 'peer',
        connect_locators: ['tcp/192.168.1.50:7447'],
        listen_locators: [],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-dup': {
        id: 'sess-dup',
        profile_id: 'prof-dup',
        zid: 'duplicate-zid-12345678',
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // Exactly 1 node: ZenohX session (deduplicated against duplicate scout entries)
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].zid, 'duplicate-zid-12345678');
    assert.equal(nodes[0].status, 'connected');
    assert.equal(nodes[0].label, 'My LAN Peer');
    assert.ok(nodes[0].connectLocators?.includes('tcp/192.168.1.50:7447'));
  });

  it('correctly maps exact verified router and peer connections and session metrics', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'router-zid-1111',
        what: 'Router',
        locators: ['tcp/192.168.1.100:7447'],
      },
      {
        zid: 'peer-zid-2222',
        what: 'Peer',
        locators: ['tcp/192.168.1.102:7447'],
      },
      {
        zid: 'unconnected-scout-3333',
        what: 'Peer',
        locators: ['tcp/192.168.1.103:7447'],
      },
    ];

    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-peer',
        name: 'Local Peer Node',
        mode: 'peer',
        connect_locators: [],
        listen_locators: [],
        scout_multicast: false,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-peer': {
        id: 'sess-1',
        profile_id: 'prof-peer',
        zid: 'peer-zid-0000',
        connected_routers: ['router-zid-1111'],
        connected_peers: ['peer-zid-2222'],
        active_subscribers: 3,
        active_queryables: 2,
        uptime_seconds: 125,
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    const localNode = nodes.find((n) => n.zid === 'peer-zid-0000');
    assert.ok(localNode);
    assert.equal(localNode?.activeSubscribers, 3);
    assert.equal(localNode?.activeQueryables, 2);
    assert.equal(localNode?.uptimeSeconds, 125);
    assert.deepEqual(localNode?.connectedRouters, ['router-zid-1111']);
    assert.deepEqual(localNode?.connectedPeers, ['peer-zid-2222']);

    // Check exact edges
    const exactRouterEdge = edges.find(
      (e) => (e.source === localNode?.id && e.target === 'scouted-router-zid-1111') ||
             (e.target === localNode?.id && e.source === 'scouted-router-zid-1111')
    );
    assert.ok(exactRouterEdge);
    assert.equal(exactRouterEdge?.isExact, true);
    assert.equal(exactRouterEdge?.status, 'active');

    const exactPeerEdge = edges.find(
      (e) => (e.source === localNode?.id && e.target === 'scouted-peer-zid-2222') ||
             (e.target === localNode?.id && e.source === 'scouted-peer-zid-2222')
    );
    assert.ok(exactPeerEdge);
    assert.equal(exactPeerEdge?.isExact, true);
    assert.equal(exactPeerEdge?.status, 'active');
  });

  it('resolves bound locators and eliminates 0.0.0.0:0 in advertised node details', () => {
    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-router-auto',
        name: 'Ephemeral Router',
        mode: 'router',
        connect_locators: [],
        listen_locators: ['tcp/0.0.0.0:0'],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-router-auto': {
        zid: 'router-zid-real-ip',
        mode: 'router',
        connected_routers: [],
        connected_peers: [],
        bound_locators: ['tcp/192.168.1.100:43219', 'tcp/127.0.0.1:43219'],
        listen_locators: ['tcp/0.0.0.0:0'],
        connect_locators: [],
        active_subscribers: 0,
        active_queryables: 0,
        uptime_seconds: 10,
        links: [],
      },
    };

    const { nodes } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles,
      existingNodes: [],
    });

    const routerNode = nodes.find((n) => n.zid === 'router-zid-real-ip');
    assert.ok(routerNode);
    // Advertised locators must use real bound locators and never show 0.0.0.0:0 or loopback
    assert.deepEqual(routerNode?.locators, ['tcp/192.168.1.100:43219']);
    assert.equal(routerNode?.locators.some((l) => l.includes('0.0.0.0:0')), false);
    assert.equal(routerNode?.locators.some((l) => l.includes('127.0.0.1')), false);
  });

  it('matches existing profiles in storage by profileId, listen_locators, connect_locators, or label', () => {
    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-router-1',
        name: 'Core Router',
        mode: 'router',
        connect_locators: [],
        listen_locators: ['tcp/0.0.0.0:7447'],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
      {
        id: 'prof-peer-1',
        name: 'Mesh Peer Alpha',
        mode: 'peer',
        connect_locators: ['tcp/192.168.1.200:7447'],
        listen_locators: ['tcp/0.0.0.0:7448'],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    // 1. Match router by listen locator
    const matchByListen = findMatchingProfile(profiles, {
      zid: 'unknown-zid-1',
      locators: ['tcp/127.0.0.1:7447'],
    });
    assert.equal(matchByListen?.id, 'prof-router-1');

    // 2. Match router by profileId
    const matchById = findMatchingProfile(profiles, {
      zid: 'any-zid',
      profileId: 'profile-prof-router-1',
    });
    assert.equal(matchById?.id, 'prof-router-1');

    // 3. Match peer by connect locator
    const matchByConnect = findMatchingProfile(profiles, {
      zid: 'unknown-zid-2',
      connectLocators: ['tcp/192.168.1.200:7447'],
    });
    assert.equal(matchByConnect?.id, 'prof-peer-1');

    // 4. Match by label
    const matchByLabel = findMatchingProfile(profiles, {
      zid: 'unknown-zid-3',
      label: 'Mesh Peer Alpha',
    });
    assert.equal(matchByLabel?.id, 'prof-peer-1');

    // 5. Does NOT match remote IP node against local 0.0.0.0 router
    const matchRemote = findMatchingProfile(profiles, {
      zid: 'remote-router-zid',
      locators: ['tcp/192.168.1.99:7447'],
    });
    assert.equal(matchRemote, undefined);

    // 6. Match by node.id with scouted- or profile- prefix
    const matchByNodeId = findMatchingProfile(profiles, {
      id: 'profile-prof-peer-1',
      zid: 'other-zid',
    });
    assert.equal(matchByNodeId?.id, 'prof-peer-1');
  });

  it('derives deterministic 32-char hex persistent ZID matching backend UUID v5', () => {
    const rawUuid = 'c7b2a95e-149f-4318-912b-31d7e2e718bc';
    assert.equal(derivePersistentZid(rawUuid), 'c7b2a95e149f4318912b31d7e2e718bc');

    const customId = 'prof-router-1';
    const zid = derivePersistentZid(customId);
    assert.equal(zid.length, 32);
    assert.match(zid, /^[0-9a-f]{32}$/);
    assert.equal(derivePersistentZid(customId), zid); // Deterministic
  });

  it('correctly propagates advertised locators to upstream router when connected in client mode', () => {
    const profiles: ConnectionProfile[] = [
      {
        id: 'client-prof-1',
        name: 'Edge Client Node',
        mode: 'client',
        connect_locators: ['tcp/192.168.1.50:7447'],
        listen_locators: [],
        scout_multicast: false,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, any> = {
      'client-prof-1': {
        id: 'sess-client-1',
        profile_id: 'client-prof-1',
        zid: 'client-zid-12345678',
        mode: 'client',
        connect_locators: ['tcp/192.168.1.50:7447'],
        listen_locators: [],
        connected_routers: ['router-zid-87654321'],
        links: [
          {
            zid: 'router-zid-87654321',
            whatami: 'router',
            src: 'tcp/192.168.1.100:54321',
            dst: 'tcp/192.168.1.50:7447',
            is_streamed: true,
          },
        ],
      },
    };

    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'router-zid-87654321',
        what: 'Router',
        locators: ['tcp/192.168.1.50:7447', 'ws/192.168.1.50:8080'],
      },
    ];

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // 1 directly tracked upstream router node
    assert.equal(nodes.length, 1);

    const routerNode = nodes.find((n) => n.zid === 'router-zid-87654321');
    assert.ok(routerNode);
    assert.equal(routerNode?.type, 'router');
    assert.equal(routerNode?.status, 'connected');
    // Advertised locators must include the upstream router locators (from link/connect/scout)
    assert.ok(routerNode?.locators.includes('tcp/192.168.1.50:7447'));
    assert.ok(routerNode?.locators.includes('ws/192.168.1.50:8080'));
  });

  it('prioritizes custom node name over profile.name for connected and scouted nodes', () => {
    const zid = '2001ee2e2260038cd5f4a53d96dcf415';
    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-edge',
        name: 'Generic Profile Name',
        mode: 'router',
        connect_locators: [],
        listen_locators: ['tcp/[2001:ee2::1]:7447'],
        config: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];

    const scoutedNodes: ScoutedNode[] = [
      {
        zid,
        what: 'Router',
        locators: ['tcp/[2001:ee2::1]:7447'],
      },
    ];

    const { nodes } = buildTopologyGraph({
      scoutedNodes,
      activeSessions: {
        'prof-edge': {
          zid,
          mode: 'router',
          locators: ['tcp/[2001:ee2::1]:7447'],
          connected_at: Date.now(),
        },
      },
      profiles,
      customNodeLabels: {
        [zid]: 'My Custom Edge Router',
      },
    });

    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].label, 'My Custom Edge Router');
  });
});




