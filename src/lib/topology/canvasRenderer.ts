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

import type { TopologyNode, TopologyEdge, LinkTrafficFlash } from '../../types/topology';
import type { ViewTransform } from './forceEngine';
import { formatByteSize } from '../trafficFormatters';

export interface RenderOptions {
  isDark: boolean;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  searchQuery: string;
  animationTick: number;
  hasTraffic?: boolean;
  activeLinkTraffic?: Record<string, LinkTrafficFlash>;
  customNodeLabels?: Record<string, string>;
  filterType?: string;
}

export interface NodeRoleStyle {
  fill: string;
  stroke: string;
  iconStroke: string;
  glow: string;
}

export function getNodeRoleColors(type: TopologyNode['type'], isDark: boolean): NodeRoleStyle {
  if (type === 'router') {
    return {
      fill: isDark ? '#1e1b4b' : '#e0e7ff', // Indigo 950 / 100
      stroke: isDark ? '#818cf8' : '#6366f1', // Indigo 400 / 500
      iconStroke: isDark ? '#c7d2fe' : '#4338ca', // Indigo 200 / 700
      glow: isDark ? 'rgba(129, 140, 248, 0.3)' : 'rgba(99, 102, 241, 0.25)',
    };
  }
  if (type === 'peer') {
    return {
      fill: isDark ? '#064e3b' : '#d1fae5', // Emerald 950 / 100
      stroke: isDark ? '#34d399' : '#10b981', // Emerald 400 / 500
      iconStroke: isDark ? '#a7f3d0' : '#047857', // Emerald 200 / 700
      glow: isDark ? 'rgba(52, 211, 153, 0.3)' : 'rgba(16, 185, 129, 0.25)',
    };
  }
  // client (default)
  return {
    fill: isDark ? '#082f49' : '#e0f2fe', // Sky 950 / 100
    stroke: isDark ? '#38bdf8' : '#0ea5e9', // Sky 400 / 500
    iconStroke: isDark ? '#bae6fd' : '#0369a1', // Sky 200 / 700
    glow: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(14, 165, 233, 0.25)',
  };
}

export function getNodeStatusColor(status: TopologyNode['status']): string {
  switch (status) {
    case 'connected':
      return '#10b981'; // Emerald-500
    case 'connecting':
      return '#f59e0b'; // Amber-500
    case 'scouted':
      return '#3b82f6'; // Blue-500
    case 'disconnected':
    default:
      return '#ef4444'; // Red-500 (Offline)
  }
}
const SERVER_SVG_PATH =
  'M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 12h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z M6 6h.01 M6 18h.01';
const SHARE2_SVG_PATH =
  'M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98';
const LAPTOP_SVG_PATH =
  'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16';

let serverPath2D: Path2D | null = null;
let share2Path2D: Path2D | null = null;
let laptopPath2D: Path2D | null = null;

if (typeof Path2D !== 'undefined') {
  try {
    serverPath2D = new Path2D(SERVER_SVG_PATH);
    share2Path2D = new Path2D(SHARE2_SVG_PATH);
    laptopPath2D = new Path2D(LAPTOP_SVG_PATH);
  } catch {
    // Fallback if Path2D SVG constructor is not supported
  }
}

/**
 * Draws the Lucide-styled vector icon according to node role:
 * - router: Server
 * - peer: Share2
 * - client: Laptop
 */
export function drawNodeRoleIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  type: TopologyNode['type'],
  strokeColor: string
): void {
  const iconSize = Math.max(12, radius * 0.7);
  const scale = iconSize / 24;

  ctx.save();
  ctx.translate(x, y);

  if (type === 'router') {
    if (serverPath2D) {
      ctx.translate(-12 * scale, -12 * scale);
      ctx.scale(scale, scale);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2 / scale > 2.5 ? 2.5 : Math.max(1.5, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(serverPath2D);
    } else {
      // Direct Canvas2D fallback for Server icon
      const w = 18 * scale;
      const h = 7 * scale;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.75;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Top rack unit
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h - 1.5 * scale, w, h, 2 * scale);
        ctx.stroke();
        // Bottom rack unit
        ctx.beginPath();
        ctx.roundRect(-w / 2, 1.5 * scale, w, h, 2 * scale);
        ctx.stroke();
      } else {
        ctx.strokeRect(-w / 2, -h - 1.5 * scale, w, h);
        ctx.strokeRect(-w / 2, 1.5 * scale, w, h);
      }
      // Status LEDs
      ctx.beginPath();
      ctx.arc(-w / 2 + 3.5 * scale, -h / 2 - 1.5 * scale, 1 * scale, 0, Math.PI * 2);
      ctx.arc(-w / 2 + 3.5 * scale, h / 2 + 1.5 * scale, 1 * scale, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
    }
  } else if (type === 'peer') {
    if (share2Path2D) {
      ctx.translate(-12 * scale, -12 * scale);
      ctx.scale(scale, scale);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2 / scale > 2.5 ? 2.5 : Math.max(1.5, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(share2Path2D);
    } else {
      // Direct Canvas2D fallback for Share2 icon
      const r = 2.5 * scale;
      const topX = 6 * scale, topY = -6 * scale;
      const botX = 6 * scale, botY = 6 * scale;
      const leftX = -6 * scale, leftY = 0;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.75;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Connecting lines
      ctx.beginPath();
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(topX, topY);
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(botX, botY);
      ctx.stroke();

      // Node circles
      ctx.beginPath();
      ctx.arc(topX, topY, r, 0, Math.PI * 2);
      ctx.arc(botX, botY, r, 0, Math.PI * 2);
      ctx.arc(leftX, leftY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // client -> Laptop icon
    if (laptopPath2D) {
      ctx.translate(-12 * scale, -12 * scale);
      ctx.scale(scale, scale);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2 / scale > 2.5 ? 2.5 : Math.max(1.5, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(laptopPath2D);
    } else {
      // Direct Canvas2D fallback for Laptop icon
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.75;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Screen
      const sw = 14 * scale;
      const sh = 9 * scale;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(-sw / 2, -sh / 2 - 2 * scale, sw, sh, 1.5 * scale);
        ctx.stroke();
      } else {
        ctx.strokeRect(-sw / 2, -sh / 2 - 2 * scale, sw, sh);
      }

      // Base
      ctx.beginPath();
      ctx.moveTo(-9 * scale, sh / 2 + 2 * scale);
      ctx.lineTo(9 * scale, sh / 2 + 2 * scale);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function isNodeMatchingFilter(node: TopologyNode, filterType?: string): boolean {
  if (!filterType || filterType === 'all') return true;
  if (filterType === 'local') return node.scope === 'local';
  if (filterType === 'remote') return node.scope === 'remote';
  if (filterType === 'router') return node.type === 'router';
  if (filterType === 'peer') return node.type === 'peer';
  if (filterType === 'client') return node.type === 'client';
  if (filterType === 'connected') return node.status === 'connected';
  return true;
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
  const {
    isDark,
    selectedNodeId,
    hoveredNodeId,
    searchQuery,
    animationTick,
    hasTraffic,
    activeLinkTraffic,
    customNodeLabels = {},
    filterType = 'all',
  } = options;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Background Grid dots with LOD scaling to prevent massive draw calls when zoomed out
  const bgDotColor = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.07)';
  let gridSize = 32 * transform.k;
  while (gridSize < 24) gridSize *= 2;
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
  const now = Date.now();

  // 1. Render Edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const sourceMatches = isNodeMatchingFilter(source, filterType);
    const targetMatches = isNodeMatchingFilter(target, filterType);
    const edgeAlpha = sourceMatches && targetMatches ? 1.0 : 0.15;

    ctx.save();
    ctx.globalAlpha = edgeAlpha;

    const isConnected = edge.status === 'active';
    const isHovered = source.id === hoveredNodeId || target.id === hoveredNodeId;
    const isSelected = source.id === selectedNodeId || target.id === selectedNodeId;

    const linkTraffic = activeLinkTraffic ? activeLinkTraffic[edge.id] : undefined;
    const isLiveTransmitting = Boolean(linkTraffic && now - linkTraffic.timestamp < 1500);

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);

    if (isLiveTransmitting) {
      ctx.strokeStyle = isDark ? '#60a5fa' : '#2563eb'; // Glowing Blue
      ctx.lineWidth = isSelected || isHovered ? 3.5 : 2.5;
    } else if (isConnected) {
      ctx.strokeStyle = isDark ? '#3b82f6' : '#2563eb'; // Blue-500
      ctx.lineWidth = isSelected || isHovered ? 3 : 2;
    } else {
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();

    if (isLiveTransmitting) {
      ctx.strokeStyle = isDark ? '#60a5fa' : '#2563eb'; // Glowing Blue
      ctx.lineWidth = isSelected || isHovered ? 3.5 : 2.5;
    } else if (isConnected) {
      ctx.strokeStyle = isDark ? '#3b82f6' : '#2563eb'; // Blue-500
      ctx.lineWidth = isSelected || isHovered ? 3 : 2;
    } else {
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();

    // Animated packet flow dots along active edges when data is transferring
    if ((edge.animated && hasTraffic) || isLiveTransmitting) {
      const dotCount = 3;
      const isReverse = linkTraffic?.direction === 'outbound';
      for (let i = 0; i < dotCount; i++) {
        const rawProgress = (animationTick * 0.025 + i / dotCount) % 1;
        const progress = isReverse ? 1 - rawProgress : rawProgress;
        const px = source.x + (target.x - source.x) * progress;
        const py = source.y + (target.y - source.y) * progress;

        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#60a5fa';
        ctx.fill();
      }
    }

    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;

    // Render Real-time Link Message Pill if transmitting
    if (isLiveTransmitting && linkTraffic) {
      const rawKey = linkTraffic.keyExpr || 'sample';
      const truncatedKey = rawKey.length > 20 ? `${rawKey.slice(0, 9)}...${rawKey.slice(-8)}` : rawKey;
      const infoText = `${truncatedKey} (${formatByteSize(linkTraffic.bytes)})`;

      ctx.font = 'bold 9px monospace';
      const textWidth = ctx.measureText(infoText).width;
      const pillW = textWidth + 10;
      const pillH = 15;
      const pillY = midY;

      ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(midX - pillW / 2, pillY - pillH / 2, pillW, pillH, 4);
      } else {
        ctx.rect(midX - pillW / 2, pillY - pillH / 2, pillW, pillH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isDark ? '#60a5fa' : '#1d4ed8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(infoText, midX, pillY);
    }

    ctx.restore();
  }

  // 2. Render Nodes
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  for (const node of nodes) {
    const isSelected = node.id === selectedNodeId;
    const isHovered = node.id === hoveredNodeId;
    const roleColors = getNodeRoleColors(node.type, isDark);

    const displayLabel =
      (node.zid && customNodeLabels[node.zid]) ||
      (node.zid && customNodeLabels[node.zid.toLowerCase()]) ||
      (node.id && customNodeLabels[node.id]) ||
      (node.zid && customNodeLabels[`scouted-${node.zid}`]) ||
      (node.zid && customNodeLabels[`scouted-${node.zid.toLowerCase()}`]) ||
      node.label;

    const matchesSearch =
      hasQuery &&
      (node.zid.toLowerCase().includes(normalizedQuery) ||
        displayLabel.toLowerCase().includes(normalizedQuery) ||
        node.locators.some((l) => l.toLowerCase().includes(normalizedQuery)) ||
        (node.connectLocators && node.connectLocators.some((l) => l.toLowerCase().includes(normalizedQuery))));

    const matchesFilter = isNodeMatchingFilter(node, filterType);
    const nodeAlpha = matchesFilter ? 1.0 : 0.2;

    ctx.save();
    ctx.globalAlpha = nodeAlpha;

    // Node Outer Glow / Selection Ring
    if (isSelected || matchesSearch) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = matchesSearch ? 'rgba(234, 179, 8, 0.25)' : roleColors.glow;
      ctx.fill();
      ctx.strokeStyle = matchesSearch ? '#eab308' : roleColors.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Main Node Circle Body
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = roleColors.fill;
    ctx.strokeStyle = roleColors.stroke;
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.fill();
    ctx.stroke();

    // Local Node Indicator Ring (Subtle concentric accent ring for local app nodes)
    if (node.scope === 'local') {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius - 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Node Role Vector Icon (Server for router, Share2 for peer, Laptop for client)
    drawNodeRoleIcon(ctx, node.x, node.y, node.radius, node.type, roleColors.iconStroke);

    // Node Label under node
    ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
    ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(displayLabel, node.x, node.y + node.radius + 6);

    // Node Scope Pill Tag (LOCAL vs REMOTE)
    const isLocal = node.scope === 'local';
    const scopeTagText = isLocal ? 'LOCAL' : 'REMOTE';
    const tagBg = isLocal
      ? isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)'
      : isDark ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.12)';
    const tagBorder = isLocal
      ? isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.3)'
      : isDark ? 'rgba(14, 165, 233, 0.4)' : 'rgba(14, 165, 233, 0.3)';
    const tagTextColor = isLocal
      ? isDark ? '#34d399' : '#059669'
      : isDark ? '#38bdf8' : '#0284c7';

    const tagW = isLocal ? 32 : 40;
    const tagH = 13;
    const tagX = node.x - tagW / 2;
    const tagY = node.y + node.radius + 20;

    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(tagX, tagY, tagW, tagH, 3);
    } else {
      ctx.rect(tagX, tagY, tagW, tagH);
    }
    ctx.fillStyle = tagBg;
    ctx.fill();
    ctx.strokeStyle = tagBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = tagTextColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scopeTagText, node.x, tagY + tagH / 2);

    ctx.restore();
  }

  ctx.restore();
}

