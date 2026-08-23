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

  // 1. Center Gravity / Centering force towards (0,0)
  for (const node of nodes) {
    if (node.fx !== null && node.fy !== null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    const centerStrength = 0.015 * alpha;
    node.vx -= node.x * centerStrength;
    node.vy -= node.y * centerStrength;
  }

  // 2. Many-body Repulsion (Coulomb charge force)
  for (let i = 0; i < nodes.length; i++) {
    const n1 = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const n2 = nodes[j];
      const dx = n2.x - n1.x || (Math.random() - 0.5) * 2;
      const dy = n2.y - n1.y || (Math.random() - 0.5) * 2;
      const distSq = Math.max(100, dx * dx + dy * dy);
      const dist = Math.sqrt(distSq);

      const minDesiredDist = n1.radius + n2.radius + 80;
      const force = (minDesiredDist * minDesiredDist * 120 * alpha) / distSq;

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
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const dx = target.x - source.x || 1;
    const dy = target.y - source.y || 1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const desiredDist = 160;
    const springStrength = 0.08 * alpha;
    const displacement = dist - desiredDist;

    const fx = (dx / dist) * displacement * springStrength;
    const fy = (dy / dist) * displacement * springStrength;

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
  const damping = 0.85;
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
    const maxSpeed = 25;
    if (speed > maxSpeed) {
      node.vx = (node.vx / speed) * maxSpeed;
      node.vy = (node.vy / speed) * maxSpeed;
    }

    node.x += node.vx;
    node.y += node.vy;
  }
}

export function applyRadialLayout(nodes: TopologyNode[]): void {
  if (nodes.length === 0) return;

  const localNode = nodes.find((n) => n.type === 'local');
  if (localNode) {
    localNode.x = 0;
    localNode.y = 0;
    localNode.vx = 0;
    localNode.vy = 0;
  }

  const ringNodes = localNode ? nodes.filter((n) => n.id !== localNode.id) : nodes;
  const routers = ringNodes.filter((n) => n.type === 'router');
  const peers = ringNodes.filter((n) => n.type === 'peer');
  const clients = ringNodes.filter((n) => n.type === 'client');
  const others = ringNodes.filter(
    (n) => n.type !== 'router' && n.type !== 'peer' && n.type !== 'client'
  );

  const placeRing = (group: TopologyNode[], radius: number) => {
    group.forEach((node, idx) => {
      const angle = (idx / Math.max(1, group.length)) * 2 * Math.PI;
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
    });
  };

  placeRing(routers, 170);
  placeRing(peers, 260);
  placeRing(clients, 330);
  placeRing(others, 200);
}
