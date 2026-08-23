import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopologyGraph,
  extractLocatorProtocol,
  extractLocatorHostPort,
  isLocatorMatch,
} from '../../src/lib/topology/topologyBuilder.ts';
import type { ScoutedNode, ConnectionProfile, ActiveSession } from '../../src/types/zenoh.ts';
import type { TopologyNode } from '../../src/types/topology.ts';

describe('Topology Data Builder', () => {
  it('extracts locator protocols correctly', () => {
    assert.equal(extractLocatorProtocol('tcp/192.168.1.50:7447'), 'tcp');
    assert.equal(extractLocatorProtocol('tls/router.cloud.zenoh.io:443'), 'tls');
    assert.equal(extractLocatorProtocol('udp/10.0.0.1:7447'), 'udp');
    assert.equal(extractLocatorProtocol('quic/127.0.0.1:7447'), 'quic');
    assert.equal(extractLocatorProtocol('invalid-format'), 'unknown');
  });

  it('extracts host and port strings from locators', () => {
    assert.equal(extractLocatorHostPort('tcp/192.168.1.50:7447'), '192.168.1.50:7447');
    assert.equal(extractLocatorHostPort('tls/router.cloud.zenoh.io:443'), 'router.cloud.zenoh.io:443');
    assert.equal(extractLocatorHostPort('raw-host'), 'raw-host');
  });

  it('matches locators across localhost and LAN IP representations', () => {
    assert.equal(isLocatorMatch('tcp/127.0.0.1:7447', 'tcp/192.168.1.50:7447'), true);
    assert.equal(isLocatorMatch('tcp/localhost:7447', 'tcp/127.0.0.1:7447'), true);
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
        mode: 'client',
        connect_locators: ['tcp/192.168.1.100:7447'],
        listen_locators: [],
        scout_multicast: false,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-1': {
        id: 'sess-1',
        profile_id: 'prof-1',
        zid: 'local-zid-001',
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

  it('automatically creates peer mesh edges between discovered LAN peers', () => {
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
    assert.equal(edges.length, 1);

    const meshEdge = edges[0];
    assert.ok(meshEdge);
    assert.equal(meshEdge.status, 'scouted');
  });

  it('filters out ZenohX own session from scout results and accurately models single local router', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'own-zenohx-client-zid',
        what: 'Client',
        locators: ['tcp/192.168.1.15:52341'],
      },
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
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // Exactly 1 node: the local router (own-zenohx-client-zid is filtered out, prof-local-router is matched to router)
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].zid, 'router-local-zenohd-zid');
    assert.equal(nodes[0].status, 'connected');
    assert.equal(nodes[0].label, 'Local Router');
    assert.equal(edges.length, 0);
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
});
