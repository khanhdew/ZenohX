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
  lastEventTimestamp?: number;
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
