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

// tests/frontend/topologyIntegration.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

// Set up mock window and Tauri internals
let mockInvokeHandler: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> = async () => undefined;

// @ts-expect-error Mocking global window
globalThis.window = globalThis;
// @ts-expect-error Mocking tauri internals
globalThis.window.__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    return mockInvokeHandler(cmd, args);
  },
  transformCallback: (cb: unknown) => cb,
};
// @ts-expect-error Mocking tauri event plugin internals
globalThis.window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: () => {},
};

import { useTopologyStore } from '../../src/stores/topologyStore.ts';
import { useConnectionStore } from '../../src/stores/connectionStore.ts';
import { TopologyWorkspace } from '../../src/components/topology/TopologyWorkspace.tsx';
import { TopologyInspector } from '../../src/components/topology/TopologyInspector.tsx';
import type { ConnectionProfile } from '../../src/types/zenoh.ts';
import type { TopologyNode } from '../../src/types/topology.ts';

describe('Topology Integration & Navigation', () => {
  beforeEach(() => {
    mockInvokeHandler = async () => undefined;

    useTopologyStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      hoveredNodeId: null,
      searchQuery: '',
      filterType: 'all',
      layoutMode: 'force',
      isSimulating: true,
      transform: { x: 0, y: 0, k: 1 },
      adminDiscoveryEnabled: true,
      adminData: null,
    });

    useConnectionStore.setState({
      profiles: [],
      selectedProfileId: null,
      activeSessions: {},
      connectingProfileIds: {},
      scoutedNodes: [],
      isScouting: false,
      error: null,
    });
  });

  it('syncs topologyStore when connectionStore scoutedNodes change', () => {
    useConnectionStore.setState({
      scoutedNodes: [
        { zid: 'router-integration-1', what: 'Router', locators: ['tcp/127.0.0.1:7447'] },
      ],
      activeSessions: {},
      profiles: [],
    });

    const { scoutedNodes, activeSessions, profiles } = useConnectionStore.getState();
    useTopologyStore.getState().syncFromContext({
      scoutedNodes,
      activeSessions,
      profiles,
    });

    const nodes = useTopologyStore.getState().nodes;
    assert.equal(nodes.length, 1);
    assert.ok(nodes.some((n) => n.zid === 'router-integration-1'));
  });

  it('selects and deselects node properly in topologyStore', () => {
    useTopologyStore.getState().setSelectedNodeId('node-test-123');
    assert.equal(useTopologyStore.getState().selectedNodeId, 'node-test-123');

    useTopologyStore.getState().setSelectedNodeId(null);
    assert.equal(useTopologyStore.getState().selectedNodeId, null);
  });

  it('exports TopologyWorkspace as a React component function', () => {
    assert.equal(typeof TopologyWorkspace, 'function');
  });

  it('TopologyWorkspace renders element tree with callbacks and optional props', () => {
    let openedProfile: ConnectionProfile | null = null;
    let navigatedPubSub = false;

    const element = React.createElement(TopologyWorkspace, {
      className: 'custom-workspace-class',
      onOpenProfileEditor: (profile) => {
        openedProfile = profile;
      },
      onNavigateToPubSub: () => {
        navigatedPubSub = true;
      },
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyWorkspace);
    assert.equal(element.props.className, 'custom-workspace-class');
    assert.equal(typeof element.props.onOpenProfileEditor, 'function');
    assert.equal(typeof element.props.onNavigateToPubSub, 'function');
  });

  it('syncs topology graph with active sessions and marks connected nodes', () => {
    useConnectionStore.setState({
      profiles: [
        {
          id: 'prof-cloud-1',
          name: 'Cloud Router',
          mode: 'client',
          connect_locators: ['tcp/10.0.0.1:7447'],
          listen_locators: [],
          scout_multicast: false,
          created_at: 1000,
          updated_at: 1000,
        },
      ],
      activeSessions: {
        'prof-cloud-1': {
          id: 'sess-cloud-1',
          profile_id: 'prof-cloud-1',
          zid: 'zid-local-client',
          mode: 'client',
          connect_locators: ['tcp/10.0.0.1:7447'],
          listen_locators: [],
          connected_routers: ['zid-cloud-router'],
          connected_peers: ['zid-peer-2'],
        },
      },
      scoutedNodes: [
        {
          zid: 'zid-cloud-router',
          what: 'Router',
          locators: ['tcp/10.0.0.1:7447'],
        },
        {
          zid: 'zid-peer-2',
          what: 'Peer',
          locators: ['udp/10.0.0.2:7447'],
        },
      ],
    });

    const { scoutedNodes, activeSessions, profiles } = useConnectionStore.getState();
    useTopologyStore.getState().syncFromContext({
      scoutedNodes,
      activeSessions,
      profiles,
    });

    const { nodes, edges } = useTopologyStore.getState();
    assert.equal(nodes.length, 3);
    assert.ok(nodes.some((n) => n.zid === 'zid-local-client' && n.scope === 'local'));
    assert.ok(nodes.some((n) => n.zid === 'zid-cloud-router' && n.status === 'connected' && n.scope === 'remote'));
    assert.ok(nodes.some((n) => n.zid === 'zid-peer-2' && n.scope === 'remote'));
  });

  it('fetchAdminTopology calls discoverAdminTopology and populates adminData with remote connect locators', async () => {
    const invokedCalls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];

    mockInvokeHandler = async (cmd, args) => {
      invokedCalls.push({ cmd, args });
      if (cmd === 'discover_admin_topology') {
        return [
          {
            keyExpr: '@/aabbccddeeff00112233445566778899/session/info',
            zid: 'aabbccddeeff00112233445566778899',
            category: 'info',
            payloadJson: JSON.stringify({
              zid: 'aabbccddeeff00112233445566778899',
              whatami: 'Router',
              locators: ['tcp/10.0.100.2:7447'],
            }),
            timestamp: 1000,
          },
          {
            keyExpr: '@/aabbccddeeff00112233445566778899/config',
            zid: 'aabbccddeeff00112233445566778899',
            category: 'config',
            payloadJson: JSON.stringify({
              connect: {
                endpoints: ['tcp/10.0.100.1:7447'],
              },
            }),
            timestamp: 1000,
          },
        ];
      }
      return undefined;
    };

    useConnectionStore.setState({
      profiles: [],
      scoutedNodes: [],
      activeSessions: {
        'prof-1': {
          id: 'sess-active-1',
          profile_id: 'prof-1',
          zid: 'zid-local-peer',
          mode: 'peer',
          connect_locators: [],
          listen_locators: [],
        },
      },
    });

    await useTopologyStore.getState().fetchAdminTopology();

    assert.equal(invokedCalls.length, 1);
    assert.equal(invokedCalls[0].cmd, 'discover_admin_topology');
    assert.deepEqual(invokedCalls[0].args, {
      sessionId: 'sess-active-1',
      maxDepth: 3,
      timeoutMs: 2500,
    });

    const adminData = useTopologyStore.getState().adminData;
    assert.ok(adminData);
    assert.ok(adminData.nodes instanceof Map);
    const remoteNode = adminData.nodes.get('aabbccddeeff00112233445566778899');
    assert.ok(remoteNode);
    assert.deepEqual(remoteNode.connectLocators, ['tcp/10.0.100.1:7447']);

    const nodes = useTopologyStore.getState().nodes;
    const graphRemoteNode = nodes.find((n) => n.zid === 'aabbccddeeff00112233445566778899');
    assert.ok(graphRemoteNode);
    assert.deepEqual(graphRemoteNode.connectLocators, ['tcp/10.0.100.1:7447']);
  });

  it('fetchAdminTopology falls back to queryAdminSpace when discoverAdminTopology fails', async () => {
    const invokedCalls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];

    mockInvokeHandler = async (cmd, args) => {
      invokedCalls.push({ cmd, args });
      if (cmd === 'discover_admin_topology') {
        throw new Error('Command discover_admin_topology not supported');
      }
      if (cmd === 'query_admin_space') {
        return [
          {
            keyExpr: '@/11223344556677889900aabbccddeeff/session/info',
            zid: '11223344556677889900aabbccddeeff',
            category: 'info',
            payloadJson: JSON.stringify({
              zid: '11223344556677889900aabbccddeeff',
              whatami: 'Router',
            }),
            timestamp: 1000,
          },
          {
            keyExpr: '@/11223344556677889900aabbccddeeff/config',
            zid: '11223344556677889900aabbccddeeff',
            category: 'config',
            payloadJson: JSON.stringify({
              connect: {
                endpoints: ['tcp/10.0.200.1:7447'],
              },
            }),
            timestamp: 1000,
          },
        ];
      }
      return undefined;
    };

    useConnectionStore.setState({
      profiles: [],
      scoutedNodes: [],
      activeSessions: {
        'prof-fallback': {
          id: 'sess-fallback-1',
          profile_id: 'prof-fallback',
          zid: 'zid-local-peer',
          mode: 'peer',
          connect_locators: [],
          listen_locators: [],
        },
      },
    });

    await useTopologyStore.getState().fetchAdminTopology();

    assert.equal(invokedCalls.length, 2);
    assert.equal(invokedCalls[0].cmd, 'discover_admin_topology');
    assert.equal(invokedCalls[1].cmd, 'query_admin_space');
    assert.deepEqual(invokedCalls[1].args, {
      sessionId: 'sess-fallback-1',
      selector: '@/**',
      timeoutMs: 2000,
    });

    const adminData = useTopologyStore.getState().adminData;
    assert.ok(adminData);
    const fallbackNode = adminData.nodes.get('11223344556677889900aabbccddeeff');
    assert.ok(fallbackNode);
    assert.deepEqual(fallbackNode.connectLocators, ['tcp/10.0.200.1:7447']);
  });

  it('TopologyInspector renders remote node connect locators and active links', () => {
    const remoteNode: TopologyNode = {
      id: 'admin-aabbccddeeff00112233445566778899',
      zid: 'aabbccddeeff00112233445566778899',
      label: 'Remote Router (aabb...8899)',
      type: 'router',
      status: 'connected',
      scope: 'remote',
      locators: ['tcp/10.0.100.2:7447'],
      connectLocators: ['tcp/10.0.100.1:7447'],
      links: [
        {
          zid: 'zid-upstream-parent',
          whatami: 'router',
          src: 'tcp/10.0.100.1:7447',
          dst: 'tcp/10.0.100.2:7447',
        },
      ],
      isTls: false,
      mode: 'router',
      connectedRouters: ['zid-upstream-parent'],
      connectedPeers: [],
      activeSubscribers: 0,
      activeQueryables: 0,
      uptimeSeconds: 0,
      x: 200,
      y: 200,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      radius: 34,
    };

    useTopologyStore.setState({
      nodes: [remoteNode],
    });

    const element = React.createElement(TopologyInspector, {
      node: remoteNode,
      onClose: () => {},
      onOpenProfileEditor: () => {},
      onNavigateToPubSub: () => {},
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyInspector);
    assert.equal(element.props.node.connectLocators[0], 'tcp/10.0.100.1:7447');
    assert.equal(element.props.node.links[0].zid, 'zid-upstream-parent');
  });
});


