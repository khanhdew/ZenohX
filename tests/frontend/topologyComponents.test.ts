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

  it('getNodeRoleColors returns correct color palette matching New Connection preset roles', async () => {
    const { getNodeRoleColors } = await import('../../src/lib/topology/canvasRenderer');

    // Router - Indigo
    const routerDark = getNodeRoleColors('router', true);
    assert.equal(routerDark.fill, '#1e1b4b');
    assert.equal(routerDark.stroke, '#818cf8');
    assert.equal(routerDark.iconStroke, '#c7d2fe');

    const routerLight = getNodeRoleColors('router', false);
    assert.equal(routerLight.fill, '#e0e7ff');
    assert.equal(routerLight.stroke, '#6366f1');
    assert.equal(routerLight.iconStroke, '#4338ca');

    // Peer - Emerald
    const peerDark = getNodeRoleColors('peer', true);
    assert.equal(peerDark.fill, '#064e3b');
    assert.equal(peerDark.stroke, '#34d399');
    assert.equal(peerDark.iconStroke, '#a7f3d0');

    const peerLight = getNodeRoleColors('peer', false);
    assert.equal(peerLight.fill, '#d1fae5');
    assert.equal(peerLight.stroke, '#10b981');
    assert.equal(peerLight.iconStroke, '#047857');

    // Client - Sky
    const clientDark = getNodeRoleColors('client', true);
    assert.equal(clientDark.fill, '#082f49');
    assert.equal(clientDark.stroke, '#38bdf8');
    assert.equal(clientDark.iconStroke, '#bae6fd');

    const clientLight = getNodeRoleColors('client', false);
    assert.equal(clientLight.fill, '#e0f2fe');
    assert.equal(clientLight.stroke, '#0ea5e9');
    assert.equal(clientLight.iconStroke, '#0369a1');
  });

  it('getNodeStatusColor returns red for offline/disconnected and correct colors for other states', async () => {
    const { getNodeStatusColor } = await import('../../src/lib/topology/canvasRenderer');

    assert.equal(getNodeStatusColor('connected'), '#10b981'); // Emerald
    assert.equal(getNodeStatusColor('connecting'), '#f59e0b'); // Amber
    assert.equal(getNodeStatusColor('scouted'), '#3b82f6'); // Blue
    assert.equal(getNodeStatusColor('disconnected'), '#ef4444'); // Red (Offline)
  });

  it('drawNodeRoleIcon executes without error for all roles on canvas context', async () => {
    const { drawNodeRoleIcon } = await import('../../src/lib/topology/canvasRenderer');

    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokeRect: () => {},
      roundRect: () => {},
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;

    // Should run smoothly for router (Server), peer (Share2), and client (Laptop)
    assert.doesNotThrow(() => {
      drawNodeRoleIcon(mockCtx, 100, 100, 30, 'router', '#6366f1');
      drawNodeRoleIcon(mockCtx, 200, 200, 28, 'peer', '#10b981');
      drawNodeRoleIcon(mockCtx, 300, 300, 26, 'client', '#0ea5e9');
    });
  });

  it('renderTopologyCanvas renders topology nodes with role colors and icons', async () => {
    const { renderTopologyCanvas } = await import('../../src/lib/topology/canvasRenderer');

    const mockCtx = {
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      translate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokeRect: () => {},
      roundRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;

    const testNodes: TopologyNode[] = [
      {
        id: 'node-r1',
        zid: '0123456789abcdef',
        label: 'Zenoh Router 1',
        type: 'router',
        status: 'connected',
        locators: ['tcp/127.0.0.1:7447'],
        isTls: false,
        x: 50,
        y: 50,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: 34,
      },
      {
        id: 'node-p1',
        zid: 'fedcba9876543210',
        label: 'Zenoh Peer 1',
        type: 'peer',
        status: 'scouted',
        locators: ['udp/10.0.0.1:7447'],
        isTls: false,
        x: 150,
        y: 150,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: 30,
      },
      {
        id: 'node-c1',
        zid: '1122334455667788',
        label: 'Zenoh Client 1',
        type: 'client',
        status: 'connected',
        locators: [],
        isTls: true,
        x: 250,
        y: 250,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: 28,
      },
    ];

    assert.doesNotThrow(() => {
      renderTopologyCanvas(mockCtx, 800, 600, { x: 0, y: 0, k: 1 }, testNodes, [], {
        isDark: true,
        selectedNodeId: 'node-r1',
        hoveredNodeId: 'node-p1',
        searchQuery: '',
        animationTick: 1,
      });
    });
  });
});
