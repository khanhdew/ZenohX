export type TrafficDirection = 'inbound' | 'outbound';

export type TrafficOpType =
  | 'pub'
  | 'sub'
  | 'query_req'
  | 'query_res'
  | 'queryable_in'
  | 'queryable_out';

export interface TrafficEvent {
  id: string;
  timestamp: number;
  sessionId?: string;
  profileId?: string;
  direction: TrafficDirection;
  opType: TrafficOpType;
  keyExpr: string;
  bytes: number;
}

export interface SecondBucket {
  timestamp: number;
  inboundBytes: number;
  outboundBytes: number;
  inboundMsgs: number;
  outboundMsgs: number;
}

export interface KeyTrafficStats {
  keyExpr: string;
  inboundBytes: number;
  outboundBytes: number;
  inboundMsgs: number;
  outboundMsgs: number;
  lastSeen: number;
}

export interface TrafficState {
  isRecording: boolean;
  historyWindowSeconds: number;
  selectedMetric: 'throughput' | 'messages';
  currentInboundBps: number;
  currentOutboundBps: number;
  currentInboundMps: number;
  currentOutboundMps: number;
  totalInboundBytes: number;
  totalOutboundBytes: number;
  totalInboundMsgs: number;
  totalOutboundMsgs: number;
  timeline: SecondBucket[];
  keyStats: Record<string, KeyTrafficStats>;
  recordEvent: (event: {
    sessionId?: string;
    profileId?: string;
    direction: TrafficDirection;
    opType: TrafficOpType;
    keyExpr: string;
    bytes: number;
  }) => void;
  tickSecond: () => void;
  toggleRecording: () => void;
  setSelectedMetric: (metric: 'throughput' | 'messages') => void;
  clearTrafficHistory: () => void;
}
