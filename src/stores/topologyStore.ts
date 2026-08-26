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

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  TopologyNode,
  TopologyEdge,
  BuildTopologyOptions,
  LinkTrafficFlash,
} from '../types/topology';
import { buildTopologyGraph } from '../lib/topology/topologyBuilder';
import { applyRadialLayout, type ViewTransform } from '../lib/topology/forceEngine';

export type TopologyFilterType = 'all' | 'router' | 'peer' | 'connected';
export type TopologyLayoutMode = 'force' | 'radial';

export interface TopologyState {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  searchQuery: string;
  filterType: TopologyFilterType;
  layoutMode: TopologyLayoutMode;
  isSimulating: boolean;
  autoScoutInterval: number; // 0 = Off, >0 milliseconds
  transform: ViewTransform;
  activeLinkTraffic: Record<string, LinkTrafficFlash>;
  customNodeLabels: Record<string, string>;

  // Actions
  syncFromContext: (opts: BuildTopologyOptions) => void;
  setNodeLabel: (zidOrId: string, label: string) => void;
  removeNodeLabel: (zidOrId: string) => void;
  setNodeName: (zidOrId: string, name: string) => void;
  removeNodeName: (zidOrId: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: TopologyFilterType) => void;
  setLayoutMode: (mode: TopologyLayoutMode) => void;
  setIsSimulating: (simulating: boolean) => void;
  setAutoScoutInterval: (interval: number) => void;
  setTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
  fitToNodes: (canvasWidth: number, canvasHeight: number) => void;
  getFilteredNodes: () => TopologyNode[];
  triggerLinkTraffic: (
    sessionId: string,
    sourceZid: string | null | undefined,
    sample: { keyExpr: string; bytes: number; direction?: 'inbound' | 'outbound' }
  ) => void;
  clearLinkTraffic: () => void;
}


export const useTopologyStore = create<TopologyState>()(
  persist(
    (set, get) => {

  const setNodeLabelFn = (zidOrId: string, label: string) => {
    const trimmed = label.trim();
    set((state) => {
      const updatedLabels = { ...state.customNodeLabels };
      const baseZid = zidOrId.startsWith('scouted-') ? zidOrId.replace('scouted-', '') : zidOrId;
      if (trimmed) {
        updatedLabels[zidOrId] = trimmed;
        updatedLabels[zidOrId.toLowerCase()] = trimmed;
        updatedLabels[baseZid] = trimmed;
        updatedLabels[baseZid.toLowerCase()] = trimmed;
        updatedLabels[`scouted-${baseZid}`] = trimmed;
      } else {
        delete updatedLabels[zidOrId];
        delete updatedLabels[zidOrId.toLowerCase()];
        delete updatedLabels[baseZid];
        delete updatedLabels[baseZid.toLowerCase()];
        delete updatedLabels[`scouted-${baseZid}`];
      }

      const updatedNodes = state.nodes.map((n) => {
        if (
          n.zid === zidOrId ||
          n.id === zidOrId ||
          n.zid.toLowerCase() === zidOrId.toLowerCase() ||
          n.zid === baseZid ||
          n.zid.toLowerCase() === baseZid.toLowerCase() ||
          n.id === `scouted-${baseZid}`
        ) {
          return { ...n, label: trimmed || n.label };
        }
        return n;
      });

      return {
        customNodeLabels: updatedLabels,
        nodes: updatedNodes,
      };
    });
  };

  const removeNodeLabelFn = (zidOrId: string) => {
    set((state) => {
      const updatedLabels = { ...state.customNodeLabels };
      const baseZid = zidOrId.startsWith('scouted-') ? zidOrId.replace('scouted-', '') : zidOrId;
      delete updatedLabels[zidOrId];
      delete updatedLabels[zidOrId.toLowerCase()];
      delete updatedLabels[baseZid];
      delete updatedLabels[baseZid.toLowerCase()];
      delete updatedLabels[`scouted-${baseZid}`];
      return { customNodeLabels: updatedLabels };
    });
  };

  return {
    nodes: [],
    edges: [],
    selectedNodeId: null,
    hoveredNodeId: null,
    searchQuery: '',
    filterType: 'all',
    layoutMode: 'force',
    isSimulating: true,
    autoScoutInterval: 0,
    transform: { x: 0, y: 0, k: 1 },
    activeLinkTraffic: {},
    customNodeLabels: {},

    syncFromContext: (opts) => {
      const existing = get().nodes;
      const customLabels = get().customNodeLabels;
      const { nodes, edges } = buildTopologyGraph({
        ...opts,
        customNodeLabels: customLabels,
        existingNodes: existing,
      });

      if (get().layoutMode === 'radial') {
        applyRadialLayout(nodes);
      }

      set({ nodes, edges });
    },

    setNodeLabel: setNodeLabelFn,
    removeNodeLabel: removeNodeLabelFn,
    setNodeName: setNodeLabelFn,
    removeNodeName: removeNodeLabelFn,


  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setHoveredNodeId: (hoveredNodeId) => set({ hoveredNodeId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilterType: (filterType) => set({ filterType }),

  setLayoutMode: (layoutMode) => {
    const nodes = [...get().nodes];
    if (layoutMode === 'radial') {
      applyRadialLayout(nodes);
    }
    set({ layoutMode, nodes });
  },

  setIsSimulating: (isSimulating) => set({ isSimulating }),
  setAutoScoutInterval: (autoScoutInterval) => set({ autoScoutInterval }),

  setTransform: (transformOrFn) => {
    set((state) => ({
      transform:
        typeof transformOrFn === 'function'
          ? transformOrFn(state.transform)
          : transformOrFn,
    }));
  },

  zoomIn: () => {
    set((state) => ({
      transform: {
        ...state.transform,
        k: Math.min(3.0, Number((state.transform.k * 1.2).toFixed(2))),
      },
    }));
  },

  zoomOut: () => {
    set((state) => ({
      transform: {
        ...state.transform,
        k: Math.max(0.2, Number((state.transform.k / 1.2).toFixed(2))),
      },
    }));
  },

  resetTransform: () => {
    set({ transform: { x: 0, y: 0, k: 1 } });
  },

  fitToNodes: (canvasWidth, canvasHeight) => {
    const { nodes } = get();
    if (nodes.length === 0) {
      set({ transform: { x: 0, y: 0, k: 1 } });
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      minX = Math.min(minX, node.x - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    }

    const boundsW = Math.max(100, maxX - minX + 80);
    const boundsH = Math.max(100, maxY - minY + 80);

    const scaleX = canvasWidth / boundsW;
    const scaleY = canvasHeight / boundsH;
    const k = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    set({
      transform: {
        x: -centerX * k,
        y: -centerY * k,
        k,
      },
    });
  },

  getFilteredNodes: () => {
    const { nodes, filterType } = get();
    if (filterType === 'all') return nodes;
    if (filterType === 'router') return nodes.filter((n) => n.type === 'router');
    if (filterType === 'peer') return nodes.filter((n) => n.type === 'peer');
    if (filterType === 'connected') return nodes.filter((n) => n.status === 'connected');
    return nodes;
  },

  triggerLinkTraffic: (sessionId, sourceZid, sample) => {
    const { edges, nodes, activeLinkTraffic } = get();
    if (edges.length === 0 || nodes.length === 0) return;

    const now = Date.now();
    const cleanSourceZid = sourceZid ? sourceZid.trim().toLowerCase() : null;

    // 1. Identify local session node
    const localNode = nodes.find(
      (n) => n.id === sessionId || n.zid === sessionId || n.profileId === sessionId || n.status === 'connected'
    );

    // 2. Identify remote node if sourceZid is available
    const remoteNode = cleanSourceZid
      ? nodes.find((n) => n.zid.toLowerCase() === cleanSourceZid || n.id.toLowerCase() === cleanSourceZid)
      : null;

    // 3. Find target edge
    let matchingEdge = edges.find((e) => {
      if (localNode && remoteNode) {
        return (
          (e.source === localNode.id && e.target === remoteNode.id) ||
          (e.source === remoteNode.id && e.target === localNode.id)
        );
      }
      if (remoteNode) {
        return e.source === remoteNode.id || e.target === remoteNode.id;
      }
      if (localNode) {
        return (e.source === localNode.id || e.target === localNode.id) && e.status === 'active';
      }
      return false;
    });

    // Fallback to first active edge if no specific edge matched
    if (!matchingEdge) {
      matchingEdge = edges.find((e) => e.status === 'active') || edges[0];
    }

    if (!matchingEdge) return;

    // Prune stale traffic entries (> 5000ms)
    const updatedTraffic: Record<string, LinkTrafficFlash> = {};
    for (const [k, v] of Object.entries(activeLinkTraffic)) {
      if (now - v.timestamp < 5000) {
        updatedTraffic[k] = v;
      }
    }

    updatedTraffic[matchingEdge.id] = {
      keyExpr: sample.keyExpr || 'unknown',
      bytes: typeof sample.bytes === 'number' ? sample.bytes : 0,
      direction: sample.direction || 'inbound',
      timestamp: now,
      sourceZid: sourceZid || undefined,
    };

    set({ activeLinkTraffic: updatedTraffic });
  },

    clearLinkTraffic: () => {
      set({ activeLinkTraffic: {} });
    },
  };
},
    {
      name: 'zenohx-topology-names',
      partialize: (state) => ({
        customNodeLabels: state.customNodeLabels,
      }),
    }
  )
);



