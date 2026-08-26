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

import type { TopologyNode, TopologyEdge } from '../../types/topology';

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  transform: ViewTransform,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const worldX = (screenX - centerX - transform.x) / transform.k;
  const worldY = (screenY - centerY - transform.y) / transform.k;
  return { x: worldX, y: worldY };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  transform: ViewTransform,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const screenX = worldX * transform.k + centerX + transform.x;
  const screenY = worldY * transform.k + centerY + transform.y;
  return { x: screenX, y: screenY };
}

export function findNodeAtPosition(
  nodes: TopologyNode[],
  worldX: number,
  worldY: number
): TopologyNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const dx = worldX - node.x;
    const dy = worldY - node.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq <= (node.radius + 6) * (node.radius + 6)) {
      return node;
    }
  }
  return null;
}

export function stepPhysicsSimulation(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  alpha = 0.05
): void {
  const nodeMap = new Map<string, TopologyNode>(nodes.map((n) => [n.id, n]));

  // 1. Center Gravity / Centering force towards (0,0) with scaling for large node counts
  const centerStrength = (0.015 / Math.max(1, Math.sqrt(nodes.length / 4))) * alpha;
  for (const node of nodes) {
    if (node.fx !== null && node.fy !== null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx -= node.x * centerStrength;
    node.vy -= node.y * centerStrength;
  }

  // 2. Many-body Repulsion (Coulomb charge force)
  for (let i = 0; i < nodes.length; i++) {
    const n1 = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const n2 = nodes[j];
      const rawDx = n2.x - n1.x;
      const rawDy = n2.y - n1.y;
      const angle = (i * 2.39996 + j) % (Math.PI * 2);
      const dx = rawDx === 0 ? Math.cos(angle) : rawDx;
      const dy = rawDy === 0 ? Math.sin(angle) : rawDy;
      const distSq = Math.max(100, dx * dx + dy * dy);
      const dist = Math.sqrt(distSq);

      const minDesiredDist = n1.radius + n2.radius + 80;
      const rawForce = (minDesiredDist * minDesiredDist * 60 * alpha) / distSq;
      const force = Math.min(rawForce, 25);

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (n1.fx === null) {
        n1.vx -= fx;
        n1.vy -= fy;
      }
      if (n2.fx === null) {
        n2.vx += fx;
        n2.vy += fy;
      }
    }
  }

  // 3. Link Spring Force
  const desiredLinkDist = Math.max(150, 100 + Math.sqrt(nodes.length) * 10);
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const dx = target.x - source.x || 1;
    const dy = target.y - source.y || 1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const springStrength = 0.06 * alpha;
    const displacement = dist - desiredLinkDist;

    const forceMagnitude = Math.min(Math.max(displacement * springStrength, -15), 15);
    const fx = (dx / dist) * forceMagnitude;
    const fy = (dy / dist) * forceMagnitude;

    if (source.fx === null) {
      source.vx += fx;
      source.vy += fy;
    }
    if (target.fx === null) {
      target.vx -= fx;
      target.vy -= fy;
    }
  }

  // 4. Velocity damping and position integration
  const damping = 0.88;
  for (const node of nodes) {
    if (node.fx !== null && node.fy !== null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= damping;
    node.vy *= damping;

    // Cap velocity
    const speed = Math.hypot(node.vx, node.vy);
    const maxSpeed = 15;
    if (speed > maxSpeed) {
      node.vx = (node.vx / speed) * maxSpeed;
      node.vy = (node.vy / speed) * maxSpeed;
    }

    node.x += node.vx;
    node.y += node.vy;
  }

  // 5. Hard Circle-Circle Collision & Overlap Resolution Pass
  const clearance = 24; // Extra padding between nodes to ensure labels and icons do not overlap
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const n1 = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const n2 = nodes[j];
        let dx = n2.x - n1.x;
        let dy = n2.y - n1.y;
        let dist = Math.hypot(dx, dy);
        const minDist = n1.radius + n2.radius + clearance;
        if (dist < minDist) {
          if (dist === 0) {
            const angle = ((i * 3 + j) * Math.PI) / 4;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 0.001;
          }
          const overlap = (minDist - dist) * 0.5;
          const nx = (dx / dist) * overlap;
          const ny = (dy / dist) * overlap;

          if (n1.fx === null && n2.fx === null) {
            n1.x -= nx;
            n1.y -= ny;
            n2.x += nx;
            n2.y += ny;
          } else if (n1.fx === null) {
            n1.x -= nx * 2;
            n1.y -= ny * 2;
          } else if (n2.fx === null) {
            n2.x += nx * 2;
            n2.y += ny * 2;
          }
        }
      }
    }
  }
}

export function applyRadialLayout(nodes: TopologyNode[]): void {
  if (nodes.length === 0) return;

  const routers = nodes.filter((n) => n.type === 'router');
  const peers = nodes.filter((n) => n.type === 'peer');
  const clients = nodes.filter((n) => n.type === 'client');

  const minArc = 90; // minimum perimeter arc length per node
  const rRadius = Math.max(170, (routers.length * minArc) / (2 * Math.PI));
  const pRadius = Math.max(rRadius + 90, 260, (peers.length * minArc) / (2 * Math.PI));
  const cRadius = Math.max(pRadius + 70, 330, (clients.length * minArc) / (2 * Math.PI));

  const placeRing = (group: TopologyNode[], radius: number) => {
    group.forEach((node, idx) => {
      const angle = (idx / Math.max(1, group.length)) * 2 * Math.PI;
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
    });
  };

  placeRing(routers, rRadius);
  placeRing(peers, pRadius);
  placeRing(clients, cRadius);
}
