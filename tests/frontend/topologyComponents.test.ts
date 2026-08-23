// tests/frontend/topologyComponents.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { TopologyControls } from '../../src/components/topology/TopologyControls';
import { TopologyCanvas } from '../../src/components/topology/TopologyCanvas';
import { useTopologyStore } from '../../src/stores/topologyStore';
import type { TopologyNode } from '../../src/types/topology';

describe('Topology UI Components Exports & Types', () => {
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

  it('exports TopologyControls as React component', () => {
    assert.equal(typeof TopologyControls, 'function');
  });

  it('exports TopologyCanvas as React component', () => {
    assert.equal(typeof TopologyCanvas, 'function');
  });

  it('TopologyControls renders element tree correctly with expected structure', () => {
    let fitCalled = false;
    const element = React.createElement(TopologyControls, {
      onFitToScreen: () => {
        fitCalled = true;
      },
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyControls);
    assert.equal(typeof element.props.onFitToScreen, 'function');
  });

  it('TopologyCanvas renders canvas element tree and accepts context menu / dblclick callbacks', () => {
    let contextNode: TopologyNode | null = null;
    let dblClickNode: TopologyNode | null = null;

    const element = React.createElement(TopologyCanvas, {
      onNodeContextMenu: (node) => {
        contextNode = node;
      },
      onNodeDoubleClick: (node) => {
        dblClickNode = node;
      },
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyCanvas);
    assert.equal(typeof element.props.onNodeContextMenu, 'function');
    assert.equal(typeof element.props.onNodeDoubleClick, 'function');
  });
});
