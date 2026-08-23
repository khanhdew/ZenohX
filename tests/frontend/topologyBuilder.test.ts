import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopologyGraph,
  extractLocatorProtocol,
  extractLocatorHostPort,
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

  it('builds topology graph with local node and scouted routers/peers', () => {
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

    // 1 local node + 2 scouted nodes = 3 nodes
    assert.equal(nodes.length, 3);
    const localNode = nodes.find((n) => n.id === 'local-zenohx');
    assert.ok(localNode);
    assert.equal(localNode?.type, 'local');
    assert.equal(localNode?.status, 'connected');

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

    // Should create an active edge between local and router
    assert.ok(edges.length >= 1);
    const activeEdge = edges.find(
      (e) => e.source === 'local-zenohx' && e.target === routerNode?.id
    );
    assert.ok(activeEdge);
    assert.equal(activeEdge?.status, 'active');
    assert.equal(activeEdge?.animated, true);
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

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // 1 local node + 1 remote unmatched node = 2 nodes
    assert.equal(nodes.length, 2);
    
    const cloudNode = nodes.find((n) => n.id === 'profile-prof-cloud');
    assert.ok(cloudNode);
    assert.equal(cloudNode?.type, 'router');
    assert.equal(cloudNode?.isTls, true);
    assert.equal(cloudNode?.status, 'connected');
    assert.equal(cloudNode?.label, 'Cloud Router');

    const activeEdge = edges.find(
      (e) => e.source === 'local-zenohx' && e.target === 'profile-prof-cloud'
    );
    assert.ok(activeEdge);
    assert.equal(activeEdge?.status, 'active');
    assert.equal(activeEdge?.isEncrypted, true);
    assert.equal(activeEdge?.animated, true);
  });

  it('automatically meshes discovered LAN peers when ZenohX is active in peer mode', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'peer-abc-123',
        what: 'Peer',
        locators: ['udp/192.168.1.55:7447'],
      },
    ];

    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-peer-local',
        name: 'My Peer Session',
        mode: 'peer',
        connect_locators: [],
        listen_locators: [],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-peer-local': {
        id: 'sess-peer',
        profile_id: 'prof-peer-local',
        zid: 'local-zid-peer',
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    const localNode = nodes.find((n) => n.id === 'local-zenohx');
    assert.equal(localNode?.label, 'ZenohX (Peer Mesh)');
    assert.equal(localNode?.mode, 'peer');

    const peerNode = nodes.find((n) => n.zid === 'peer-abc-123');
    assert.ok(peerNode);
    assert.equal(peerNode?.status, 'connected'); // Meshed with local peer

    const meshEdge = edges.find((e) => e.source === 'local-zenohx' && e.target === peerNode?.id);
    assert.ok(meshEdge);
    assert.equal(meshEdge?.status, 'active');
    assert.equal(meshEdge?.animated, true);
  });
});
