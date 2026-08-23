import { create } from 'zustand';
import type {
  TopologyNode,
  TopologyEdge,
  BuildTopologyOptions,
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
  transform: ViewTransform;

  // Actions
  syncFromContext: (opts: BuildTopologyOptions) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: TopologyFilterType) => void;
  setLayoutMode: (mode: TopologyLayoutMode) => void;
  setIsSimulating: (simulating: boolean) => void;
  setTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
  fitToNodes: (canvasWidth: number, canvasHeight: number) => void;
  getFilteredNodes: () => TopologyNode[];
}

export const useTopologyStore = create<TopologyState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  hoveredNodeId: null,
  searchQuery: '',
  filterType: 'all',
  layoutMode: 'force',
  isSimulating: true,
  transform: { x: 0, y: 0, k: 1 },

  syncFromContext: (opts) => {
    const existing = get().nodes;
    const { nodes, edges } = buildTopologyGraph({
      ...opts,
      existingNodes: existing,
    });

    if (get().layoutMode === 'radial') {
      applyRadialLayout(nodes);
    }

    set({ nodes, edges });
  },

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
}));
