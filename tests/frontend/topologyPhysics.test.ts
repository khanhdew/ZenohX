import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  screenToWorld,
  worldToScreen,
  findNodeAtPosition,
  stepPhysicsSimulation,
  applyRadialLayout,
} from '../../src/lib/topology/forceEngine.ts';
import type { TopologyNode, TopologyEdge } from '../../src/types/topology.ts';

describe('Topology Physics & Coordinate Math', () => {
  it('projects screen coordinates to world coordinates and back', () => {
    const transform = { x: 100, y: 50, k: 1.5 };
    const width = 800;
    const height = 600;

    const screenX = 500;
    const screenY = 350;

    const world = screenToWorld(screenX, screenY, transform, width, height);
    const backToScreen = worldToScreen(world.x, world.y, transform, width, height);

    assert.ok(Math.abs(backToScreen.x - screenX) < 0.001);
    assert.ok(Math.abs(backToScreen.y - screenY) < 0.001);
  });

  it('detects node hit at specific world coordinates', () => {
    const nodes: TopologyNode[] = [
      {
        id: 'node-1',
        zid: '1111',
        label: 'Node 1',
        type: 'router',
        status: 'scouted',
        locators: [],
        isTls: false,
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: 30,
      },
      {
        id: 'node-2',
        zid: '2222',
        label: 'Node 2',
        type: 'peer',
        status: 'scouted',
        locators: [],
        isTls: false,
        x: 300,
        y: 300,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: 20,
      },
    ];

    // Inside node-1 radius
    const hit1 = findNodeAtPosition(nodes, 110, 110);
    assert.equal(hit1?.id, 'node-1');

    // Outside both nodes
    const hitNone = findNodeAtPosition(nodes, 200, 200);
    assert.equal(hitNone, null);

    // Inside node-2 radius
    const hit2 = findNodeAtPosition(nodes, 305, 305);
    assert.equal(hit2?.id, 'node-2');
  });

  it('steps physics simulation and repels overlapping nodes', () => {
    const nodes: TopologyNode[] = [
      {
        id: 'a',
        zid: 'a',
        label: 'A',
        type: 'router',
        status: 'scouted',
        locators: [],
        isTls: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: 30,
      },
      {
        id: 'b',
        zid: 'b',
        label: 'B',
        type: 'peer',
        status: 'scouted',
        locators: [],
        isTls: false,
        x: 5,
        y: 0,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        radius: 30,
      },
    ];
    const edges: TopologyEdge[] = [];

    const initialDistance = Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y);
    stepPhysicsSimulation(nodes, edges, 0.1);
    const newDistance = Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y);

    assert.ok(newDistance > initialDistance, 'Nodes should repel each other when close');
  });

  it('arranges nodes in radial layout around hub/local node', () => {
    const nodes: TopologyNode[] = [
      { id: 'local-zenohx', zid: 'local', label: 'Local', type: 'local', status: 'connected', locators: [], isTls: false, x: 50, y: 50, vx: 0, vy: 0, fx: null, fy: null, radius: 30 },
      { id: 'r1', zid: 'r1', label: 'Router 1', type: 'router', status: 'scouted', locators: [], isTls: false, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, radius: 30 },
      { id: 'p1', zid: 'p1', label: 'Peer 1', type: 'peer', status: 'scouted', locators: [], isTls: false, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, radius: 25 },
    ];

    applyRadialLayout(nodes);
    assert.equal(nodes[0].x, 0);
    assert.equal(nodes[0].y, 0);
    assert.ok(Math.hypot(nodes[1].x, nodes[1].y) > 50);
  });
});
