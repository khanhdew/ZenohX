import React, { useRef, useEffect, useCallback } from 'react';
import { useTopologyStore } from '../../stores/topologyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  screenToWorld,
  findNodeAtPosition,
  stepPhysicsSimulation,
} from '../../lib/topology/forceEngine';
import { renderTopologyCanvas } from '../../lib/topology/canvasRenderer';
import { TopologyControls } from './TopologyControls';
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
  const transform = useTopologyStore((s) => s.transform);
  const isSimulating = useTopologyStore((s) => s.isSimulating);
  const layoutMode = useTopologyStore((s) => s.layoutMode);

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

          renderTopologyCanvas(ctx, clientWidth, clientHeight, transform, nodes, edges, {
            isDark,
            selectedNodeId,
            hoveredNodeId,
            searchQuery,
            animationTick: animationTickRef.current,
          });

          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [nodes, edges, transform, isSimulating, layoutMode, isDark, selectedNodeId, hoveredNodeId, searchQuery]);

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

    if (draggedNodeRef.current) {
      const worldPos = screenToWorld(
        mouseX,
        mouseY,
        transform,
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      );
      draggedNodeRef.current.fx = worldPos.x;
      draggedNodeRef.current.fy = worldPos.y;
      draggedNodeRef.current.x = worldPos.x;
      draggedNodeRef.current.y = worldPos.y;
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
    if (draggedNodeRef.current) {
      draggedNodeRef.current.fx = null;
      draggedNodeRef.current.fy = null;
      draggedNodeRef.current = null;
    }
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((prev) => ({
      ...prev,
      k: Math.max(0.2, Math.min(3.0, Number((prev.k * zoomFactor).toFixed(2)))),
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
      <TopologyControls onFitToScreen={handleFitToScreen} />
    </div>
  );
};
