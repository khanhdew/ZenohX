import { create } from 'zustand';
import { TrafficState, SecondBucket, KeyTrafficStats } from '../types/traffic';

const MAX_WINDOW_SECONDS = 60;

// Scratch bucket collecting events during current 1-second window
let currentScratchBucket: SecondBucket = {
  timestamp: Date.now(),
  inboundBytes: 0,
  outboundBytes: 0,
  inboundMsgs: 0,
  outboundMsgs: 0,
};

let tickerInterval: ReturnType<typeof setInterval> | null = null;

export const useTrafficStore = create<TrafficState>((set, get) => ({
  isRecording: true,
  historyWindowSeconds: MAX_WINDOW_SECONDS,
  selectedMetric: 'throughput',

  currentInboundBps: 0,
  currentOutboundBps: 0,
  currentInboundMps: 0,
  currentOutboundMps: 0,

  totalInboundBytes: 0,
  totalOutboundBytes: 0,
  totalInboundMsgs: 0,
  totalOutboundMsgs: 0,

  timeline: [],
  keyStats: {},

  recordEvent: (event) => {
    if (!get().isRecording) return;

    const bytes = Math.max(0, event.bytes || 0);
    const isInbound = event.direction === 'inbound';
    const now = Date.now();

    // Accumulate into scratch bucket
    if (isInbound) {
      currentScratchBucket.inboundBytes += bytes;
      currentScratchBucket.inboundMsgs += 1;
    } else {
      currentScratchBucket.outboundBytes += bytes;
      currentScratchBucket.outboundMsgs += 1;
    }

    // Accumulate per-key stats
    const key = event.keyExpr || 'unknown';
    const existing = get().keyStats[key] || {
      keyExpr: key,
      inboundBytes: 0,
      outboundBytes: 0,
      inboundMsgs: 0,
      outboundMsgs: 0,
      lastSeen: now,
    };

    const updatedKeyStat: KeyTrafficStats = {
      ...existing,
      inboundBytes: existing.inboundBytes + (isInbound ? bytes : 0),
      outboundBytes: existing.outboundBytes + (isInbound ? 0 : bytes),
      inboundMsgs: existing.inboundMsgs + (isInbound ? 1 : 0),
      outboundMsgs: existing.outboundMsgs + (isInbound ? 0 : 1),
      lastSeen: now,
    };

    set((state) => ({
      totalInboundBytes: state.totalInboundBytes + (isInbound ? bytes : 0),
      totalOutboundBytes: state.totalOutboundBytes + (isInbound ? 0 : bytes),
      totalInboundMsgs: state.totalInboundMsgs + (isInbound ? 1 : 0),
      totalOutboundMsgs: state.totalOutboundMsgs + (isInbound ? 0 : 1),
      keyStats: {
        ...state.keyStats,
        [key]: updatedKeyStat,
      },
    }));
  },

  tickSecond: () => {
    const bucket = { ...currentScratchBucket, timestamp: Date.now() };

    // Reset scratch bucket for next interval
    currentScratchBucket = {
      timestamp: Date.now(),
      inboundBytes: 0,
      outboundBytes: 0,
      inboundMsgs: 0,
      outboundMsgs: 0,
    };

    set((state) => {
      const newTimeline = [...state.timeline, bucket].slice(-state.historyWindowSeconds);

      return {
        timeline: newTimeline,
        currentInboundBps: bucket.inboundBytes,
        currentOutboundBps: bucket.outboundBytes,
        currentInboundMps: bucket.inboundMsgs,
        currentOutboundMps: bucket.outboundMsgs,
      };
    });
  },

  toggleRecording: () => {
    set((state) => ({ isRecording: !state.isRecording }));
  },

  setSelectedMetric: (metric) => {
    set({ selectedMetric: metric });
  },

  clearTrafficHistory: () => {
    currentScratchBucket = {
      timestamp: Date.now(),
      inboundBytes: 0,
      outboundBytes: 0,
      inboundMsgs: 0,
      outboundMsgs: 0,
    };
    set({
      currentInboundBps: 0,
      currentOutboundBps: 0,
      currentInboundMps: 0,
      currentOutboundMps: 0,
      totalInboundBytes: 0,
      totalOutboundBytes: 0,
      totalInboundMsgs: 0,
      totalOutboundMsgs: 0,
      timeline: [],
      keyStats: {},
    });
  },
}));

// Manage global 1-second ticker interval
export function initTrafficTicker(): () => void {
  if (!tickerInterval && typeof window !== 'undefined') {
    tickerInterval = setInterval(() => {
      useTrafficStore.getState().tickSecond();
    }, 1000);
  }

  return () => {
    if (tickerInterval) {
      clearInterval(tickerInterval);
      tickerInterval = null;
    }
  };
}
