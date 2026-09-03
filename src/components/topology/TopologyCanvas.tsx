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

import React, { useRef, useEffect, useCallback } from 'react';
import { useTopologyStore } from '../../stores/topologyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTrafficStore } from '../../stores/trafficStore';
import {
  screenToWorld,
  findNodeAtPosition,
  stepPhysicsSimulation,
} from '../../lib/topology/forceEngine';
import { renderTopologyCanvas } from '../../lib/topology/canvasRenderer';
import { TopologyControls } from './TopologyControls';
import { Radar } from 'lucide-react';
import type { TopologyNode } from '../../types/topology';

interface TopologyCanvasProps {
  onNodeContextMenu?: (node: TopologyNode, e: React.MouseEvent) => void;
  onNodeDoubleClick?: (node: TopologyNode) => void;
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  onNodeContextMenu,
  onNodeDoubleClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const nodes = useTopologyStore((s) => s.nodes);
  const edges = useTopologyStore((s) => s.edges);
  const selectedNodeId = useTopologyStore((s) => s.selectedNodeId);
  const hoveredNodeId = useTopologyStore((s) => s.hoveredNodeId);
  const searchQuery = useTopologyStore((s) => s.searchQuery);
  const filterType = useTopologyStore((s) => s.filterType);
  const transform = useTopologyStore((s) => s.transform);
  const isSimulating = useTopologyStore((s) => s.isSimulating);
  const layoutMode = useTopologyStore((s) => s.layoutMode);

  const customNodeLabels = useTopologyStore((s) => s.customNodeLabels);
  const setSelectedNodeId = useTopologyStore((s) => s.setSelectedNodeId);
  const setHoveredNodeId = useTopologyStore((s) => s.setHoveredNodeId);
  const setTransform = useTopologyStore((s) => s.setTransform);
  const fitToNodes = useTopologyStore((s) => s.fitToNodes);

  const theme = useSettingsStore((s) => s.theme);
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Interaction State Refs
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const draggedNodeRef = useRef<TopologyNode | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const animationTickRef = useRef(0);

  // Fit to screen handler
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    fitToNodes(clientWidth, clientHeight);
  }, [fitToNodes]);

  // Main 60 FPS Render & Physics Loop
  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      animationTickRef.current += 1;
      const canvas = canvasRef.current;
      if (canvas && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== clientWidth * dpr || canvas.height !== clientHeight * dpr) {
          canvas.width = clientWidth * dpr;
          canvas.height = clientHeight * dpr;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // Step physics simulation if active
          if (isSimulating && layoutMode === 'force') {
            stepPhysicsSimulation(nodes, edges, 0.06);
          }

          const traffic = useTrafficStore.getState();
          const activeLinkTraffic = useTopologyStore.getState().activeLinkTraffic;
          const hasTraffic =
            (traffic.currentInboundMps > 0 || traffic.currentOutboundMps > 0) ||
            (traffic.lastEventTimestamp ? Date.now() - traffic.lastEventTimestamp < 1500 : false);

          renderTopologyCanvas(ctx, clientWidth, clientHeight, transform, nodes, edges, {
            isDark,
            selectedNodeId,
            hoveredNodeId,
            searchQuery,
            animationTick: animationTickRef.current,
            hasTraffic,
            activeLinkTraffic,
            customNodeLabels,
            filterType,
          });

          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [nodes, edges, transform, isSimulating, layoutMode, isDark, selectedNodeId, hoveredNodeId, searchQuery, filterType, customNodeLabels]);

  // Mouse & Pointer Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldPos = screenToWorld(
      mouseX,
      mouseY,
      transform,
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );

    const clickedNode = findNodeAtPosition(nodes, worldPos.x, worldPos.y);

    if (e.button === 0) {
      if (clickedNode) {
        draggedNodeRef.current = clickedNode;
        draggedNodeIdRef.current = clickedNode.id;
        clickedNode.fx = clickedNode.x;
        clickedNode.fy = clickedNode.y;
        setSelectedNodeId(clickedNode.id);
      } else {
        isPanningRef.current = true;
        panStartRef.current = {
          x: mouseX,
          y: mouseY,
          tx: transform.x,
          ty: transform.y,
        };
        setSelectedNodeId(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggedNodeIdRef.current) {
      const activeNode =
        nodes.find((n) => n.id === draggedNodeIdRef.current) || draggedNodeRef.current;
      if (activeNode) {
        const worldPos = screenToWorld(
          mouseX,
          mouseY,
          transform,
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
        activeNode.fx = worldPos.x;
        activeNode.fy = worldPos.y;
        activeNode.x = worldPos.x;
        activeNode.y = worldPos.y;
      }
      return;
    }

    if (isPanningRef.current) {
      const dx = mouseX - panStartRef.current.x;
      const dy = mouseY - panStartRef.current.y;
      setTransform((prev) => ({
        ...prev,
        x: panStartRef.current.tx + dx,
        y: panStartRef.current.ty + dy,
      }));
      return;
    }

    // Hover detection
    const worldPos = screenToWorld(
      mouseX,
      mouseY,
      transform,
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    const hit = findNodeAtPosition(nodes, worldPos.x, worldPos.y);
    setHoveredNodeId(hit ? hit.id : null);
  };

  const handleMouseUp = () => {
    if (draggedNodeIdRef.current) {
      const activeNode =
        nodes.find((n) => n.id === draggedNodeIdRef.current) || draggedNodeRef.current;
      if (activeNode) {
        activeNode.fx = null;
        activeNode.fy = null;
      }
      draggedNodeRef.current = null;
      draggedNodeIdRef.current = null;
    }
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Avoid e.preventDefault() to prevent passive listener warnings
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newK = Math.max(0.2, Math.min(3.0, Number((transform.k * zoomFactor).toFixed(2))));

    if (newK === transform.k) return;

    const cx = containerRef.current.clientWidth / 2;
    const cy = containerRef.current.clientHeight / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;

    const scaleRatio = newK / transform.k;
    const newX = dx - (dx - transform.x) * scaleRatio;
    const newY = dy - (dy - transform.y) * scaleRatio;

    setTransform((prev) => ({
      ...prev,
      k: newK,
      x: newX,
      y: newY,
    }));
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldPos = screenToWorld(
      mouseX,
      mouseY,
      transform,
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );

    const targetNode = findNodeAtPosition(nodes, worldPos.x, worldPos.y);
    if (targetNode && onNodeDoubleClick) {
      onNodeDoubleClick(targetNode);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldPos = screenToWorld(
      mouseX,
      mouseY,
      transform,
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );

    const targetNode = findNodeAtPosition(nodes, worldPos.x, worldPos.y);
    if (targetNode && onNodeContextMenu) {
      setSelectedNodeId(targetNode.id);
      onNodeContextMenu(targetNode, e);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full bg-background overflow-hidden select-none cursor-grab active:cursor-grabbing"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center z-10">
          <div className="p-3 rounded-full bg-muted/60 text-muted-foreground mb-3">
            <Radar className="w-8 h-8 opacity-50" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">No Active Nodes or Connections</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Connect to a profile or router to view the network topology and introspect mesh routers.
          </p>
        </div>
      )}
      <TopologyControls onFitToScreen={handleFitToScreen} />
    </div>
  );
};
