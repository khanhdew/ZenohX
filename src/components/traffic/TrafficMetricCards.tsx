import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  Hash,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useTrafficStore } from '../../stores/trafficStore';
import {
  formatThroughput,
  formatMessageRate,
  formatByteSize,
} from '../../lib/trafficFormatters';

interface TrafficMetricCardsProps {
  className?: string;
}

export const TrafficMetricCards: React.FC<TrafficMetricCardsProps> = ({ className = '' }) => {
  const currentInboundBps = useTrafficStore((s) => s.currentInboundBps);
  const currentOutboundBps = useTrafficStore((s) => s.currentOutboundBps);
  const currentInboundMps = useTrafficStore((s) => s.currentInboundMps);
  const currentOutboundMps = useTrafficStore((s) => s.currentOutboundMps);

  const totalInboundBytes = useTrafficStore((s) => s.totalInboundBytes);
  const totalOutboundBytes = useTrafficStore((s) => s.totalOutboundBytes);
  const totalInboundMsgs = useTrafficStore((s) => s.totalInboundMsgs);
  const totalOutboundMsgs = useTrafficStore((s) => s.totalOutboundMsgs);

  const keyStats = useTrafficStore((s) => s.keyStats);
  const totalKeysCount = Object.keys(keyStats).length;

  const totalBytes = totalInboundBytes + totalOutboundBytes;
  const totalMsgs = totalInboundMsgs + totalOutboundMsgs;
  const currentTotalBps = currentInboundBps + currentOutboundBps;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}>
      {/* 1. Inbound Throughput Card */}
      <div className="rounded-lg border border-emerald-500/20 bg-card p-3.5 shadow-xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none -mr-4 -mt-4" />
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Inbound Rate
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
            <TrendingDown className="w-3 h-3" />
            {formatMessageRate(currentInboundMps)}
          </span>
        </div>

        <div className="my-1">
          <div className="text-xl font-bold font-mono text-foreground tracking-tight">
            {formatThroughput(currentInboundBps)}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-2 border-t border-border/50">
          <span>Total: {formatByteSize(totalInboundBytes)}</span>
          <span>{totalInboundMsgs.toLocaleString()} msgs</span>
        </div>
      </div>

      {/* 2. Outbound Throughput Card */}
      <div className="rounded-lg border border-sky-500/20 bg-card p-3.5 shadow-xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-xl pointer-events-none -mr-4 -mt-4" />
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="p-1 rounded-md bg-sky-500/10 text-sky-500 dark:text-sky-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Outbound Rate
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
            <TrendingUp className="w-3 h-3" />
            {formatMessageRate(currentOutboundMps)}
          </span>
        </div>

        <div className="my-1">
          <div className="text-xl font-bold font-mono text-foreground tracking-tight">
            {formatThroughput(currentOutboundBps)}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-2 border-t border-border/50">
          <span>Total: {formatByteSize(totalOutboundBytes)}</span>
          <span>{totalOutboundMsgs.toLocaleString()} msgs</span>
        </div>
      </div>

      {/* 3. Aggregate Volume Card */}
      <div className="rounded-lg border border-violet-500/20 bg-card p-3.5 shadow-xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-xl pointer-events-none -mr-4 -mt-4" />
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="p-1 rounded-md bg-violet-500/10 text-violet-500 dark:text-violet-400">
              <Activity className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Aggregate Volume
            </span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            {formatThroughput(currentTotalBps)}
          </span>
        </div>

        <div className="my-1">
          <div className="text-xl font-bold font-mono text-foreground tracking-tight">
            {formatByteSize(totalBytes)}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-2 border-t border-border/50">
          <span>Combined Total</span>
          <span>{totalMsgs.toLocaleString()} ops</span>
        </div>
      </div>

      {/* 4. Monitored Keys Card */}
      <div className="rounded-lg border border-amber-500/20 bg-card p-3.5 shadow-xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none -mr-4 -mt-4" />
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="p-1 rounded-md bg-amber-500/10 text-amber-500 dark:text-amber-400">
              <Hash className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Monitored Topics
            </span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Active Keys
          </span>
        </div>

        <div className="my-1">
          <div className="text-xl font-bold font-mono text-foreground tracking-tight">
            {totalKeysCount}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-2 border-t border-border/50">
          <span>Unique Key Expressions</span>
          <span>{totalKeysCount === 1 ? '1 topic' : `${totalKeysCount} topics`}</span>
        </div>
      </div>
    </div>
  );
};

export default TrafficMetricCards;
