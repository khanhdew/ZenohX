import type { TopologyNode, TopologyEdge } from '../../types/topology';
import type { ViewTransform } from './forceEngine';

export interface RenderOptions {
  isDark: boolean;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  searchQuery: string;
  animationTick: number;
  hasTraffic?: boolean;
}

export function renderTopologyCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  transform: ViewTransform,
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  options: RenderOptions
): void {
  const { isDark, selectedNodeId, hoveredNodeId, searchQuery, animationTick, hasTraffic } = options;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Background Grid dots
  const bgDotColor = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.07)';
  const gridSize = 32 * transform.k;
  const offsetX = (width / 2 + transform.x) % gridSize;
  const offsetY = (height / 2 + transform.y) % gridSize;

  ctx.fillStyle = bgDotColor;
  for (let x = offsetX; x < width; x += gridSize) {
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Camera transform to world space
  ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
  ctx.scale(transform.k, transform.k);

  const nodeMap = new Map<string, TopologyNode>(nodes.map((n) => [n.id, n]));

  // 1. Render Edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const isConnected = edge.status === 'active';
    const isHovered = source.id === hoveredNodeId || target.id === hoveredNodeId;
    const isSelected = source.id === selectedNodeId || target.id === selectedNodeId;

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);

    if (isConnected) {
      ctx.strokeStyle = isDark ? '#10b981' : '#059669'; // Emerald-500
      ctx.lineWidth = isSelected || isHovered ? 3 : 2;
    } else {
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();

    // Animated packet flow dots along active edges ONLY when data is transferring
    if (edge.animated && hasTraffic) {
      const dotCount = 3;
      for (let i = 0; i < dotCount; i++) {
        const progress = (animationTick * 0.02 + i / dotCount) % 1;
        const px = source.x + (target.x - source.x) * progress;
        const py = source.y + (target.y - source.y) * progress;

        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.fill();
      }
    }

    // Protocol label pill at midpoint
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const protocolText = edge.protocol.toUpperCase();

    ctx.font = '9px monospace';
    const textWidth = ctx.measureText(protocolText).width;
    const pillW = textWidth + 8;
    const pillH = 14;

    ctx.fillStyle = isDark ? '#1e293b' : '#f1f5f9';
    ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(midX - pillW / 2, midY - pillH / 2, pillW, pillH, 4);
    } else {
      ctx.rect(midX - pillW / 2, midY - pillH / 2, pillW, pillH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(protocolText, midX, midY);
  }

  // 2. Render Nodes
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  for (const node of nodes) {
    const isSelected = node.id === selectedNodeId;
    const isHovered = node.id === hoveredNodeId;
    const matchesSearch =
      hasQuery &&
      (node.zid.toLowerCase().includes(normalizedQuery) ||
        node.label.toLowerCase().includes(normalizedQuery) ||
        node.locators.some((l) => l.toLowerCase().includes(normalizedQuery)));

    // Node Outer Glow / Selection Ring
    if (isSelected || matchesSearch) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = matchesSearch ? 'rgba(234, 179, 8, 0.25)' : 'rgba(59, 130, 246, 0.25)';
      ctx.fill();
      ctx.strokeStyle = matchesSearch ? '#eab308' : '#3b82f6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Main Node Circle Body
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

    if (node.type === 'router') {
      ctx.fillStyle = isDark ? '#312e81' : '#e0e7ff'; // Indigo tint
      ctx.strokeStyle = isDark ? '#818cf8' : '#4f46e5';
    } else if (node.type === 'peer') {
      ctx.fillStyle = isDark ? '#172554' : '#dbeafe'; // Blue tint
      ctx.strokeStyle = isDark ? '#3b82f6' : '#2563eb';
    } else {
      ctx.fillStyle = isDark ? '#1e293b' : '#f1f5f9'; // Slate
      ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
    }

    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.fill();
    ctx.stroke();

    // Node Type Icon Text / Letter
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const iconLetter = node.type === 'router' ? 'R' : node.type === 'peer' ? 'P' : 'C';
    ctx.fillText(iconLetter, node.x, node.y);

    // Node Status Dot Badge
    const statusColor =
      node.status === 'connected'
        ? '#10b981'
        : node.status === 'connecting'
        ? '#f59e0b'
        : node.status === 'scouted'
        ? '#3b82f6'
        : '#64748b';

    ctx.beginPath();
    ctx.arc(node.x + node.radius * 0.7, node.y - node.radius * 0.7, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = statusColor;
    ctx.fill();
    ctx.strokeStyle = isDark ? '#0f172a' : '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Node Label under node
    ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
    ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(node.label, node.x, node.y + node.radius + 6);
  }

  ctx.restore();
}
