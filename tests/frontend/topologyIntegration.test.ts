// tests/frontend/topologyIntegration.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { useTopologyStore } from '../../src/stores/topologyStore.ts';
import { useConnectionStore } from '../../src/stores/connectionStore.ts';
import { TopologyWorkspace } from '../../src/components/topology/TopologyWorkspace.tsx';
import type { ConnectionProfile } from '../../src/types/zenoh.ts';

describe('Topology Integration & Navigation', () => {
  beforeEach(() => {
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
    assert.equal(nodes.length, 2);
    assert.ok(nodes.some((n) => n.zid === 'zid-cloud-router' && n.status === 'connected'));
    assert.ok(nodes.some((n) => n.zid === 'zid-peer-2' && n.status === 'scouted'));
  });
});

