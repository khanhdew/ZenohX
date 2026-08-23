// tests/frontend/topologyStore.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useTopologyStore } from '../../src/stores/topologyStore.ts';
import type { ScoutedNode, ConnectionProfile } from '../../src/types/zenoh.ts';

describe('Topology Store', () => {
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
  });

  it('initializes with default state', () => {
    const state = useTopologyStore.getState();
    assert.deepEqual(state.nodes, []);
    assert.deepEqual(state.edges, []);
    assert.equal(state.selectedNodeId, null);
    assert.equal(state.hoveredNodeId, null);
    assert.equal(state.searchQuery, '');
    assert.equal(state.filterType, 'all');
    assert.equal(state.layoutMode, 'force');
    assert.equal(state.isSimulating, true);
    assert.deepEqual(state.transform, { x: 0, y: 0, k: 1 });
  });

  it('syncs topology data from scouted nodes and profiles', () => {
    const scoutedNodes: ScoutedNode[] = [
      { zid: 'aaaa1111', what: 'Router', locators: ['tcp/10.0.0.1:7447'] },
    ];
    const profiles: ConnectionProfile[] = [];

    useTopologyStore.getState().syncFromContext({
      scoutedNodes,
      activeSessions: {},
      profiles,
    });

    const state = useTopologyStore.getState();
    assert.equal(state.nodes.length, 2); // local + 1 scouted
    assert.ok(state.nodes.some((n) => n.zid === 'aaaa1111'));
  });

  it('applies radial layout during sync if layoutMode is radial', () => {
    useTopologyStore.getState().setLayoutMode('radial');
    const scoutedNodes: ScoutedNode[] = [
      { zid: 'r1', what: 'Router', locators: ['tcp/10.0.0.1:7447'] },
    ];
    useTopologyStore.getState().syncFromContext({
      scoutedNodes,
      activeSessions: {},
      profiles: [],
    });

    const state = useTopologyStore.getState();
    const routerNode = state.nodes.find((n) => n.zid === 'r1');
    assert.ok(routerNode);
    // In radial layout, router node is on a ring (radius 170)
    const dist = Math.hypot(routerNode.x, routerNode.y);
    assert.ok(Math.abs(dist - 170) < 0.1);
  });

  it('updates selection, hover, search query, and simulation state', () => {
    const store = useTopologyStore.getState();
    store.setSelectedNodeId('node-1');
    assert.equal(useTopologyStore.getState().selectedNodeId, 'node-1');

    store.setHoveredNodeId('node-2');
    assert.equal(useTopologyStore.getState().hoveredNodeId, 'node-2');

    store.setSearchQuery('zenoh-test');
    assert.equal(useTopologyStore.getState().searchQuery, 'zenoh-test');

    store.setIsSimulating(false);
    assert.equal(useTopologyStore.getState().isSimulating, false);
  });

  it('filters nodes based on filterType', () => {
    const scoutedNodes: ScoutedNode[] = [
      { zid: 'r1', what: 'Router', locators: ['tcp/10.0.0.1:7447'] },
      { zid: 'p1', what: 'Peer', locators: [] },
    ];
    const profiles: ConnectionProfile[] = [
      {
        id: 'prof-1',
        name: 'Profile 1',
        mode: 'client',
        connect_locators: ['tcp/10.0.0.1:7447'],
        listen_locators: [],
        config: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];
    const activeSessions = {
      'prof-1': {
        zid: 'local-zid',
        mode: 'client',
        locators: [],
        connected_at: Date.now(),
      },
    };

    useTopologyStore.getState().syncFromContext({
      scoutedNodes,
      activeSessions,
      profiles,
    });

    // filterType: all -> all nodes
    useTopologyStore.getState().setFilterType('all');
    let filtered = useTopologyStore.getState().getFilteredNodes();
    assert.equal(filtered.length, 3); // local, r1, p1

    // filterType: router -> router nodes only
    useTopologyStore.getState().setFilterType('router');
    filtered = useTopologyStore.getState().getFilteredNodes();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].type, 'router');

    // filterType: peer -> peer nodes only
    useTopologyStore.getState().setFilterType('peer');
    filtered = useTopologyStore.getState().getFilteredNodes();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].type, 'peer');

    // filterType: connected -> connected nodes (local and r1)
    useTopologyStore.getState().setFilterType('connected');
    filtered = useTopologyStore.getState().getFilteredNodes();
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((n) => n.status === 'connected'));
  });

  it('handles layout mode transitions', () => {
    const scoutedNodes: ScoutedNode[] = [
      { zid: 'r1', what: 'Router', locators: [] },
    ];
    useTopologyStore.getState().syncFromContext({
      scoutedNodes,
      activeSessions: {},
      profiles: [],
    });

    useTopologyStore.getState().setLayoutMode('radial');
    const state = useTopologyStore.getState();
    assert.equal(state.layoutMode, 'radial');
    const routerNode = state.nodes.find((n) => n.zid === 'r1');
    assert.ok(routerNode);
    assert.ok(Math.abs(Math.hypot(routerNode.x, routerNode.y) - 170) < 0.1);
  });

  it('handles setTransform with direct value and function updater', () => {
    useTopologyStore.getState().setTransform({ x: 50, y: 100, k: 1.5 });
    assert.deepEqual(useTopologyStore.getState().transform, { x: 50, y: 100, k: 1.5 });

    useTopologyStore.getState().setTransform((prev) => ({
      ...prev,
      x: prev.x + 20,
    }));
    assert.deepEqual(useTopologyStore.getState().transform, { x: 70, y: 100, k: 1.5 });
  });

  it('handles zoom in and zoom out actions within bounds', () => {
    useTopologyStore.getState().zoomIn();
    assert.ok(useTopologyStore.getState().transform.k > 1);

    useTopologyStore.getState().resetTransform();
    assert.equal(useTopologyStore.getState().transform.k, 1);

    useTopologyStore.getState().zoomOut();
    assert.ok(useTopologyStore.getState().transform.k < 1);

    // Zoom out multiple times should not drop below min zoom 0.2
    for (let i = 0; i < 20; i++) {
      useTopologyStore.getState().zoomOut();
    }
    assert.equal(useTopologyStore.getState().transform.k, 0.2);

    // Zoom in multiple times should not exceed max zoom 3.0
    for (let i = 0; i < 30; i++) {
      useTopologyStore.getState().zoomIn();
    }
    assert.equal(useTopologyStore.getState().transform.k, 3.0);
  });

  it('handles fitToNodes with empty nodes and calculates bounding box for nodes', () => {
    // Empty nodes
    useTopologyStore.getState().fitToNodes(800, 600);
    assert.deepEqual(useTopologyStore.getState().transform, { x: 0, y: 0, k: 1 });

    // With nodes
    useTopologyStore.getState().syncFromContext({
      scoutedNodes: [
        { zid: 'r1', what: 'Router', locators: [] },
      ],
      activeSessions: {},
      profiles: [],
    });

    useTopologyStore.getState().fitToNodes(1000, 800);
    const transform = useTopologyStore.getState().transform;
    assert.ok(transform.k >= 0.3 && transform.k <= 1.5);
    assert.ok(typeof transform.x === 'number');
    assert.ok(typeof transform.y === 'number');
  });

  it('updates autoScoutInterval state', () => {
    assert.equal(useTopologyStore.getState().autoScoutInterval, 0);

    useTopologyStore.getState().setAutoScoutInterval(10000);
    assert.equal(useTopologyStore.getState().autoScoutInterval, 10000);

    useTopologyStore.getState().setAutoScoutInterval(0);
    assert.equal(useTopologyStore.getState().autoScoutInterval, 0);
  });
});
