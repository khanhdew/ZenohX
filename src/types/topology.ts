/**
 * ZenohX Topology Graph Types & Interfaces
 */

import type { ScoutedNode, ConnectionProfile, ActiveSession } from './zenoh';

export type TopologyNodeType = 'router' | 'peer' | 'client';
export type TopologyNodeStatus = 'connected' | 'scouted' | 'connecting' | 'disconnected';
export type TopologyProtocol = 'tcp' | 'tls' | 'udp' | 'quic' | 'ws' | 'unix' | 'mesh' | 'unknown';

export interface TopologyNode {
  id: string;
  zid: string;
  label: string;
  type: TopologyNodeType;
  status: TopologyNodeStatus;
  locators: string[];
  isTls: boolean;
  profileId?: string;
  mode?: string;

  // Coordinates & physics state
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  radius: number;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  protocol: TopologyProtocol;
  locator: string;
  status: 'active' | 'scouted' | 'pending';
  isEncrypted: boolean;
  animated: boolean;
}

export interface TopologyGraphData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface BuildTopologyOptions {
  scoutedNodes: ScoutedNode[];
  activeSessions: Record<string, ActiveSession>;
  profiles: ConnectionProfile[];
  existingNodes?: TopologyNode[];
}
