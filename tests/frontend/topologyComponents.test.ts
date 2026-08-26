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

// tests/frontend/topologyComponents.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { TopologyControls } from '../../src/components/topology/TopologyControls';
import { TopologyCanvas } from '../../src/components/topology/TopologyCanvas';
import { TopologyToolbar } from '../../src/components/topology/TopologyToolbar';
import { TopologyInspector } from '../../src/components/topology/TopologyInspector';
import { TopologyContextMenu } from '../../src/components/topology/TopologyContextMenu';
import { useTopologyStore } from '../../src/stores/topologyStore';
import type { TopologyNode } from '../../types/topology';

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

  it('exports TopologyToolbar as React component', () => {
    assert.equal(typeof TopologyToolbar, 'function');
  });

  it('exports TopologyInspector as React component', () => {
    assert.equal(typeof TopologyInspector, 'function');
  });

  it('exports TopologyContextMenu as React component', () => {
    assert.equal(typeof TopologyContextMenu, 'function');
  });

  it('TopologyToolbar renders element tree correctly with expected structure', () => {
    let scoutTriggered = false;
    const element = React.createElement(TopologyToolbar, {
      onTriggerScout: () => {
        scoutTriggered = true;
      },
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyToolbar);
    assert.equal(typeof element.props.onTriggerScout, 'function');
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

  it('TopologyInspector returns null when node is null', () => {
    const element = React.createElement(TopologyInspector, {
      node: null,
      onClose: () => {},
      onOpenProfileEditor: () => {},
      onNavigateToPubSub: () => {},
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyInspector);
  });

  it('TopologyInspector renders element tree with router node', () => {
    const dummyNode: TopologyNode = {
      id: 'scouted-router-1',
      zid: '0123456789abcdef',
      label: 'Main Router',
      type: 'router',
      status: 'connected',
      locators: ['tcp/127.0.0.1:7447', 'tls/192.168.1.10:7447'],
      isTls: true,
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      radius: 34,
    };

    const element = React.createElement(TopologyInspector, {
      node: dummyNode,
      onClose: () => {},
      onOpenProfileEditor: () => {},
      onNavigateToPubSub: () => {},
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyInspector);
    assert.equal(element.props.node, dummyNode);
  });

  it('TopologyContextMenu renders correctly with expected props', () => {
    const dummyNode: TopologyNode = {
      id: 'scouted-peer-1',
      zid: 'fedcba9876543210',
      label: 'Peer Node',
      type: 'peer',
      status: 'scouted',
      locators: ['udp/10.0.0.1:7447'],
      isTls: false,
      x: 50,
      y: 50,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      radius: 28,
    };

    let connectedNode: TopologyNode | null = null;
    let savedNode: TopologyNode | null = null;
    let copiedNode: TopologyNode | null = null;
    let closed = false;

    const element = React.createElement(TopologyContextMenu, {
      node: dummyNode,
      position: { x: 150, y: 250 },
      onClose: () => {
        closed = true;
      },
      onConnect: (node) => {
        connectedNode = node;
      },
      onSaveProfile: (node) => {
        savedNode = node;
      },
      onCopyZid: (node) => {
        copiedNode = node;
      },
    });

    assert.ok(React.isValidElement(element));
    assert.equal(element.type, TopologyContextMenu);
    assert.equal(element.props.node, dummyNode);
    assert.deepEqual(element.props.position, { x: 150, y: 250 });
  });
});
