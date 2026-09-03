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
import { parseAdminSpaceEntries } from '../../src/lib/topology/adminSpaceParser.ts';
import type { ScoutedNode, ConnectionProfile, ActiveSession } from '../../src/types/zenoh.ts';
import type { TopologyNode, AdminSpaceEntry, AdminTopologyData } from '../../src/types/topology.ts';

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
    assert.equal(peerNode?.status, 'connected');

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

  it('includes non-scouted active sessions in graph and displays remote upstream router', () => {
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
        connected_routers: ['cloud-router-zid'],
        links: [
          {
            src: 'tcp/192.168.1.50:54321',
            dst: 'tls/router.cloud.zenoh.io:443',
            zid: 'cloud-router-zid',
            whatami: 'router',
          },
        ],
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // Local client node + Remote upstream router node
    assert.equal(nodes.length, 2);
    
    const clientNode = nodes.find((n) => n.id === 'profile-prof-cloud');
    assert.ok(clientNode);
    assert.equal(clientNode?.type, 'client');
    assert.equal(clientNode?.scope, 'local');
    assert.equal(clientNode?.status, 'connected');

    const remoteRouterNode = nodes.find((n) => n.scope === 'remote');
    assert.ok(remoteRouterNode);
    assert.equal(remoteRouterNode?.type, 'router');
    assert.equal(remoteRouterNode?.isTls, true);
    assert.equal(remoteRouterNode?.status, 'connected');

    assert.equal(edges.length, 1);
    assert.equal(edges[0].isEncrypted, true);
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

  it('connects a client node to ONLY its active physical router link when multiple connect locators are configured', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'router-1-zid',
        what: 'Router',
        locators: ['tcp/10.0.0.1:7447'],
      },
      {
        zid: 'router-2-zid',
        what: 'Router',
        locators: ['tcp/10.0.0.2:7447'],
      },
    ];

    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-client',
        name: 'Client Edge',
        mode: 'client',
        connect_locators: ['tcp/10.0.0.1:7447', 'tcp/10.0.0.2:7447'],
        listen_locators: [],
        scout_multicast: false,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-client': {
        id: 'sess-client',
        profile_id: 'prof-client',
        zid: 'client-zid-1234',
        connected_routers: ['router-1-zid'],
        links: [
          {
            zid: 'router-1-zid',
            whatami: 'router',
            src: 'tcp/10.0.0.100:54321',
            dst: 'tcp/10.0.0.1:7447',
            is_streamed: true,
            mtu: 65535,
            interfaces: [],
          },
        ],
        connected_at: '2026-01-01T00:00:00Z',
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes,
      activeSessions,
      profiles,
      existingNodes: [],
    });

    assert.equal(nodes.length, 3);

    const clientEdges = edges.filter(
      (e) => e.source === 'profile-prof-client' || e.target === 'profile-prof-client'
    );
    assert.equal(clientEdges.length, 1);
    const linkedTarget = clientEdges[0].source === 'profile-prof-client' ? clientEdges[0].target : clientEdges[0].source;
    const targetRouter = nodes.find((n) => n.id === linkedTarget);
    assert.equal(targetRouter?.zid, 'router-1-zid');
  });

  it('accurately models local client and connected scouted router', () => {
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

    // Local client node and remote scouted router node
    assert.equal(nodes.length, 2);
    const clientNode = nodes.find((n) => n.scope === 'local');
    assert.ok(clientNode);
    assert.equal(clientNode?.type, 'client');

    const routerNode = nodes.find((n) => n.zid === 'router-local-zenohd-zid');
    assert.ok(routerNode);
    assert.equal(routerNode?.status, 'connected');
    assert.equal(routerNode?.type, 'router');
    assert.equal(routerNode?.scope, 'remote');

    assert.equal(edges.length, 1);
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

  it('resolves bound locators for dynamic peer and keeps router strictly static', () => {
    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-peer-auto',
        name: 'Ephemeral Peer',
        mode: 'peer',
        connect_locators: [],
        listen_locators: ['tcp/0.0.0.0:0'],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
      {
        id: 'prof-router-static',
        name: 'Static Router',
        mode: 'router',
        connect_locators: [],
        listen_locators: ['tcp/192.168.1.1:7447'],
        scout_multicast: true,
        created_at: 1704067200000,
        updated_at: 1704067200000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-peer-auto': {
        zid: 'peer-zid-real-ip',
        mode: 'peer',
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
      'prof-router-static': {
        zid: 'router-zid-static-ip',
        mode: 'router',
        connected_routers: [],
        connected_peers: [],
        bound_locators: ['tcp/192.168.1.1:7447', 'tcp/127.0.0.1:7447'],
        listen_locators: ['tcp/192.168.1.1:7447'],
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

    const peerNode = nodes.find((n) => n.zid === 'peer-zid-real-ip');
    assert.ok(peerNode);
    // Peer resolves dynamic bound locators
    assert.deepEqual(peerNode?.locators, ['tcp/192.168.1.100:43219']);

    const routerNode = nodes.find((n) => n.zid === 'router-zid-static-ip');
    assert.ok(routerNode);
    // Router stays strictly static as configured
    assert.deepEqual(routerNode?.locators, ['tcp/192.168.1.1:7447']);
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

    // 1 local client node and 1 upstream router node
    assert.equal(nodes.length, 2);

    const clientNode = nodes.find((n) => n.zid === 'client-zid-12345678');
    assert.ok(clientNode);
    assert.equal(clientNode?.type, 'client');
    assert.equal(clientNode?.scope, 'local');

    const routerNode = nodes.find((n) => n.zid === 'router-zid-87654321');
    assert.ok(routerNode);
    assert.equal(routerNode?.type, 'router');
    assert.equal(routerNode?.status, 'connected');
    assert.equal(routerNode?.scope, 'remote');
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

  it('does not turn disconnected local app profile into remote node when stale scout entry exists', () => {
    const profile: ConnectionProfile = {
      id: 'prof-local-router',
      name: 'Local Gateway Router',
      mode: 'router',
      connect_locators: [],
      listen_locators: ['tcp/127.0.0.1:7447'],
      scout_multicast: true,
      created_at: 1000,
      updated_at: 1000,
    };

    const persistentZid = derivePersistentZid(profile.id);

    const scoutedNodes: ScoutedNode[] = [
      {
        zid: persistentZid,
        what: 'Router',
        locators: ['tcp/127.0.0.1:7447'],
      },
      {
        zid: 'external-scouted-router-1234',
        what: 'Router',
        locators: ['tcp/192.168.1.200:7447'],
      },
    ];

    // When disconnected (activeSessions is empty):
    const { nodes } = buildTopologyGraph({
      scoutedNodes,
      activeSessions: {},
      profiles: [profile],
      existingNodes: [],
    });

    // Only the external router is rendered as remote; the disconnected local app profile is excluded
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].zid, 'external-scouted-router-1234');
    assert.equal(nodes[0].scope, 'remote');
  });

  it('synthesizes multi-hop remote routers and remote links from Admin Space data', () => {
    const adminNodes = new Map();
    adminNodes.set('cloud-router-1', {
      zid: 'cloud-router-1',
      whatami: 'router',
      version: '1.7.2',
      locators: ['tcp/172.66.1.1:7447'],
      neighbors: ['cloud-router-2'],
      links: [],
    });
    adminNodes.set('cloud-router-2', {
      zid: 'cloud-router-2',
      whatami: 'router',
      version: '1.7.2',
      locators: ['tcp/172.66.1.2:7447'],
      neighbors: ['cloud-router-1'],
      links: [],
    });

    const adminLinks = [
      {
        sourceZid: 'cloud-router-1',
        targetZid: 'cloud-router-2',
        srcLocator: 'tcp/172.66.1.1:7447',
        dstLocator: 'tcp/172.66.1.2:7447',
        isStreamed: true,
      },
    ];

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions: {},
      profiles: [],
      adminData: {
        nodes: adminNodes,
        links: adminLinks,
      },
    });

    assert.equal(nodes.length, 2);
    assert.ok(nodes.some((n) => n.zid === 'cloud-router-1' && n.scope === 'remote'));
    assert.ok(nodes.some((n) => n.zid === 'cloud-router-2' && n.scope === 'remote'));
    assert.equal(edges.length, 1);
    assert.equal(edges[0].status, 'active');
  });

  it('unifies multiple locators (tcp, tls, udp) of a single remote router into ONE remote node', () => {
    const profile: ConnectionProfile = {
      id: 'local-client-1',
      name: 'Client App',
      mode: 'client',
      connect_locators: [
        'tcp/172.66.1.1:7447',
        'tls/172.66.1.1:7446',
        'udp/172.66.1.1:7447',
      ],
      listen_locators: [],
      scout_multicast: true,
      created_at: 1000,
      updated_at: 1000,
    };

    const sessionInfo: ActiveSession = {
      id: 'session-client-1',
      profile_id: 'local-client-1',
      mode: 'client',
      zid: 'client-zid-1234',
      listen_locators: [],
      connect_locators: [
        'tcp/172.66.1.1:7447',
        'tls/172.66.1.1:7446',
        'udp/172.66.1.1:7447',
      ],
      connected_routers: ['remote-router-zid-9999'],
      connected_peers: [],
      links: [
        {
          zid: 'remote-router-zid-9999',
          whatami: 'router',
          src: 'tcp/192.168.1.50:54321',
          dst: 'tcp/172.66.1.1:7447',
          is_streamed: true,
        },
      ],
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [
        {
          zid: 'remote-router-zid-9999',
          what: 'Router',
          locators: ['tcp/172.66.1.1:7447', 'tls/172.66.1.1:7446'],
        },
      ],
      activeSessions: {
        'local-client-1': sessionInfo,
      },
      profiles: [profile],
    });

    // Expect exactly 2 nodes: 1 Local Client and 1 Remote Router (NOT 4 separate routers for each locator)
    assert.equal(nodes.length, 2);

    const localNode = nodes.find((n) => n.scope === 'local');
    const remoteRouter = nodes.find((n) => n.scope === 'remote');

    assert.ok(localNode, 'Local client node must exist');
    assert.ok(remoteRouter, 'Remote router node must exist');
    assert.equal(remoteRouter.zid, 'remote-router-zid-9999');
    assert.equal(remoteRouter.type, 'router');

    // All locators must be aggregated inside the single remote router
    assert.ok(remoteRouter.locators.includes('tcp/172.66.1.1:7447'));
    assert.ok(remoteRouter.locators.includes('tls/172.66.1.1:7446'));

    // There should be exactly 1 active edge connecting Local Client to Remote Router
    assert.equal(edges.length, 1);
    assert.equal(edges[0].source, localNode.id);
    assert.equal(edges[0].target, remoteRouter.id);
  });

  it('keeps distinct nodes on the same IP host with different ports separate', () => {
    const scoutedNodes: ScoutedNode[] = [
      {
        zid: 'router-port-7447',
        what: 'Router',
        locators: ['tcp/192.168.1.50:7447'],
      },
      {
        zid: 'router-port-7448',
        what: 'Router',
        locators: ['tcp/192.168.1.50:7448'],
      },
    ];

    const { nodes } = buildTopologyGraph({
      scoutedNodes,
      activeSessions: {},
      profiles: [],
      existingNodes: [],
    });

    assert.equal(nodes.length, 2, 'Two distinct routers on different ports must not be merged');
    assert.ok(nodes.some((n) => n.zid === 'router-port-7447'));
    assert.ok(nodes.some((n) => n.zid === 'router-port-7448'));
  });

  it('connects to multiple distinct upstreams without overwriting ZIDs or merging nodes', () => {
    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-multi-up',
        name: 'Multi-Router Client',
        mode: 'client',
        connect_locators: ['tcp/10.0.0.1:7447', 'tcp/10.0.0.2:7447'],
        listen_locators: [],
        scout_multicast: false,
        created_at: 1000,
        updated_at: 1000,
      },
    ];

    const activeSessions: Record<string, ActiveSession> = {
      'prof-multi-up': {
        id: 'sess-multi-up',
        profile_id: 'prof-multi-up',
        zid: 'local-client-zid-1',
        mode: 'client',
        connected_routers: ['router-upstream-1', 'router-upstream-2'],
        connect_locators: ['tcp/10.0.0.1:7447', 'tcp/10.0.0.2:7447'],
        listen_locators: [],
        links: [
          {
            zid: 'router-upstream-1',
            whatami: 'router',
            src: 'tcp/10.0.0.100:50001',
            dst: 'tcp/10.0.0.1:7447',
            is_streamed: true,
          },
          {
            zid: 'router-upstream-2',
            whatami: 'router',
            src: 'tcp/10.0.0.100:50002',
            dst: 'tcp/10.0.0.2:7447',
            is_streamed: true,
          },
        ],
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles,
      existingNodes: [],
    });

    // Expect 3 nodes: 1 local client and 2 upstream routers (router-upstream-1 and router-upstream-2)
    assert.equal(nodes.length, 3, 'Must have 1 local client and 2 distinct upstream routers');
    const r1 = nodes.find((n) => n.zid === 'router-upstream-1');
    const r2 = nodes.find((n) => n.zid === 'router-upstream-2');
    const client = nodes.find((n) => n.zid === 'local-client-zid-1');

    assert.ok(r1, 'router-upstream-1 must exist');
    assert.ok(r2, 'router-upstream-2 must exist');
    assert.ok(client, 'local client must exist');

    assert.equal(edges.length, 2, 'Must have 2 active edges connecting client to both routers');
  });

  it('preserves localhost connect_locators even when other connect_locators exist', () => {
    const profile: ConnectionProfile = {
      id: 'prof-dual-connect',
      name: 'Dual Connect Node',
      mode: 'peer',
      connect_locators: ['tcp/127.0.0.1:7447', 'tcp/192.168.1.50:7447'],
      listen_locators: [],
      scout_multicast: false,
      created_at: 1000,
      updated_at: 1000,
    };

    const activeSessions: Record<string, ActiveSession> = {
      'prof-dual-connect': {
        id: 'sess-dual',
        profile_id: 'prof-dual-connect',
        zid: 'peer-local-zid',
        mode: 'peer',
        connect_locators: ['tcp/127.0.0.1:7447', 'tcp/192.168.1.50:7447'],
        listen_locators: [],
        connected_routers: [],
        connected_peers: [],
        links: [],
      },
    };

    const { nodes } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles: [profile],
      existingNodes: [],
    });

    const localNode = nodes.find((n) => n.zid === 'peer-local-zid');
    assert.ok(localNode);
    assert.ok(localNode.connectLocators?.includes('tcp/127.0.0.1:7447'), '127.0.0.1 connect locator must not be stripped');
    assert.ok(localNode.connectLocators?.includes('tcp/192.168.1.50:7447'), '192.168.1.50 connect locator must be kept');
  });

  it('consolidates all listen locators of a remote router from Admin Space into a single node without duplicate listen nodes', () => {
    const remoteRouterZid = '16c8087948a803dd35c400495f5be4f2';
    const rawEntries: AdminSpaceEntry[] = [
      {
        keyExpr: `@/${remoteRouterZid}/session/info`,
        zid: remoteRouterZid,
        category: 'info',
        payloadJson: JSON.stringify({
          zid: remoteRouterZid,
          whatami: 'Router',
          version: '1.7.2',
          locators: [
            'tcp/192.168.1.100:7447',
            'tls/192.168.1.100:7446',
            'quic/192.168.1.100:7448',
            'ws/192.168.1.100:8080',
          ],
        }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${remoteRouterZid}/session/transport/unicast/listen/tcp/0.0.0.0/7447`,
        zid: remoteRouterZid,
        category: 'transport',
        payloadJson: JSON.stringify({ locator: 'tcp/0.0.0.0:7447' }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${remoteRouterZid}/session/transport/unicast/listen/tls/0.0.0.0/7446`,
        zid: remoteRouterZid,
        category: 'transport',
        payloadJson: JSON.stringify({ locator: 'tls/0.0.0.0:7446' }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${remoteRouterZid}/session/link/unicast/listen/0`,
        zid: remoteRouterZid,
        category: 'link',
        payloadJson: JSON.stringify({ src: 'tcp/0.0.0.0:7447', dst: '' }),
        timestamp: 1000,
      },
    ];

    const adminData = parseAdminSpaceEntries(rawEntries);

    const clientProfile: ConnectionProfile = {
      id: 'prof-client',
      name: 'Local Client',
      mode: 'client',
      connect_locators: ['tcp/192.168.1.100:7447'],
      listen_locators: [],
      scout_multicast: false,
      created_at: 1000,
      updated_at: 1000,
    };

    const activeSessions: Record<string, ActiveSession> = {
      'prof-client': {
        id: 'sess-client',
        profile_id: 'prof-client',
        zid: 'client-app-zid',
        mode: 'client',
        connect_locators: ['tcp/192.168.1.100:7447'],
        listen_locators: [],
        connected_routers: [remoteRouterZid],
        connected_peers: [],
        links: [
          {
            zid: remoteRouterZid,
            whatami: 'router',
            src: 'tcp/192.168.1.50:54321',
            dst: 'tcp/192.168.1.100:7447',
            is_streamed: true,
            interfaces: [],
          },
        ],
      },
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles: [clientProfile],
      adminData,
      existingNodes: [],
    });

    // Exactly 2 nodes: 1 local client and 1 remote router (NO extra nodes for listen locators / ports / tokens)
    assert.equal(nodes.length, 2, `Expected 2 nodes (client + router), but got ${nodes.length}: ${nodes.map((n) => `${n.label} (zid: ${n.zid})`).join(', ')}`);

    const routerNode = nodes.find((n) => n.zid === remoteRouterZid);
    assert.ok(routerNode, 'Remote router must exist in graph');
    assert.equal(routerNode.scope, 'remote');
    assert.equal(routerNode.status, 'connected');
    assert.equal(routerNode.type, 'router');

    // All locators must be on this router node
    assert.ok(routerNode.locators.includes('tcp/192.168.1.100:7447'));
    assert.ok(routerNode.locators.includes('tls/192.168.1.100:7446'));
    assert.ok(routerNode.locators.includes('quic/192.168.1.100:7448'));
    assert.ok(routerNode.locators.includes('ws/192.168.1.100:8080'));

    // Edges: 1 edge between local client and remote router
    assert.equal(edges.length, 1);
  });

  it('does NOT ingest ephemeral client socket ports (e.g. 44331) as listen locators for connected nodes', () => {
    const activeSessions: Record<string, ActiveSession> = {
      'prof-router': {
        id: 'sess-router',
        profile_id: 'prof-router',
        zid: 'router-zid-authoritative',
        mode: 'router',
        listen_locators: ['tcp/192.168.101.1:7447'],
        connect_locators: [],
        links: [
          {
            zid: 'client-zid-remote-1',
            whatami: 'client',
            src: 'tcp/192.168.101.1:7447',
            dst: 'tcp/192.168.101.10:44331', // Ephemeral client TCP socket
            is_streamed: true,
            interfaces: [],
          },
        ],
      },
    };

    const { nodes } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions,
      profiles: [],
      existingNodes: [],
    });

    assert.equal(nodes.length, 2);

    const clientNode = nodes.find((n) => n.zid === 'client-zid-remote-1');
    assert.ok(clientNode);
    assert.equal(clientNode.type, 'client');
    // Ephemeral port 44331 must NOT be in locators
    assert.equal(clientNode.locators.length, 0);
    assert.ok(!clientNode.locators.some((l) => l.includes('44331')));
  });

  it('populates connectLocators on remote admin nodes and links edges', () => {
    const adminData: AdminTopologyData = {
      nodes: new Map([
        [
          'sub-peer-1',
          {
            zid: 'sub-peer-1',
            whatami: 'peer',
            locators: ['tcp/192.168.1.200:7447'],
            connectLocators: ['tcp/10.0.0.1:7447'],
            neighbors: [],
            links: [],
          },
        ],
        [
          'parent-router-1',
          {
            zid: 'parent-router-1',
            whatami: 'router',
            locators: ['tcp/10.0.0.1:7447'],
            connectLocators: [],
            neighbors: ['sub-peer-1'],
            links: [],
          },
        ],
      ]),
      links: [
        {
          sourceZid: 'sub-peer-1',
          targetZid: 'parent-router-1',
          srcLocator: 'tcp/192.168.1.200:54321',
          dstLocator: 'tcp/10.0.0.1:7447',
        },
      ],
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions: {},
      profiles: [],
      adminData,
    });

    const subNode = nodes.find((n) => n.zid === 'sub-peer-1');
    assert.ok(subNode);
    assert.deepEqual(subNode.connectLocators, ['tcp/10.0.0.1:7447']);

    const edge = edges.find(
      (e) =>
        (e.source === subNode.id && e.target === 'admin-parent-router-1') ||
        (e.target === subNode.id && e.source === 'admin-parent-router-1')
    );
    assert.ok(edge, 'Edge should exist between sub-node and parent router');
  });

  it('merges connectLocators when updating existing node from Admin Space', () => {
    const profile: ConnectionProfile = {
      id: 'sub-peer-2',
      name: 'Sub Peer 2',
      mode: 'peer',
      connect_locators: ['tcp/10.0.0.1:7447'],
      listen_locators: ['tcp/192.168.1.201:7447'],
      scout_multicast: false,
      created_at: 1000,
      updated_at: 1000,
    };

    const adminData: AdminTopologyData = {
      nodes: new Map([
        [
          'sub-peer-2',
          {
            zid: 'sub-peer-2',
            whatami: 'peer',
            locators: ['tcp/192.168.1.201:7447'],
            connectLocators: ['tcp/10.0.0.2:7447'],
            neighbors: [],
            links: [],
          },
        ],
      ]),
      links: [],
    };

    const { nodes } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions: {
        'sub-peer-2': {
          id: 'sess-2',
          profile_id: 'sub-peer-2',
          zid: 'sub-peer-2',
          connected_at: '2026-01-01T00:00:00Z',
          connect_locators: ['tcp/10.0.0.1:7447'],
        },
      },
      profiles: [profile],
      adminData,
    });

    const node = nodes.find((n) => n.zid === 'sub-peer-2');
    assert.ok(node);
    assert.deepEqual(node.connectLocators, ['tcp/10.0.0.1:7447', 'tcp/10.0.0.2:7447']);
  });

  it('links sub-node to parent router by matching dstLocator when targetZid is omitted', () => {
    const adminData: AdminTopologyData = {
      nodes: new Map([
        [
          'sub-peer-3',
          {
            zid: 'sub-peer-3',
            whatami: 'peer',
            locators: ['tcp/192.168.1.202:7447'],
            connectLocators: ['tcp/10.0.0.5:7447'],
            neighbors: [],
            links: [],
          },
        ],
        [
          'parent-router-5',
          {
            zid: 'parent-router-5',
            whatami: 'router',
            locators: ['tcp/10.0.0.5:7447'],
            connectLocators: [],
            neighbors: [],
            links: [],
          },
        ],
      ]),
      links: [
        {
          sourceZid: 'sub-peer-3',
          srcLocator: 'tcp/192.168.1.202:54322',
          dstLocator: 'tcp/10.0.0.5:7447',
        },
      ],
    };

    const { nodes, edges } = buildTopologyGraph({
      scoutedNodes: [],
      activeSessions: {},
      profiles: [],
      adminData,
    });

    const subNode = nodes.find((n) => n.zid === 'sub-peer-3');
    const parentNode = nodes.find((n) => n.zid === 'parent-router-5');
    assert.ok(subNode);
    assert.ok(parentNode);

    const edge = edges.find(
      (e) =>
        (e.source === subNode.id && e.target === parentNode.id) ||
        (e.target === subNode.id && e.source === parentNode.id)
    );
    assert.ok(edge, 'Edge should exist between sub-node and parent router matching dstLocator');
  });
});






