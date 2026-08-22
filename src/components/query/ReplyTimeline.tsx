import React, { useState, useMemo } from 'react';
import {
  Activity,
  XCircle,
  Clock,
  Search,
  ArrowUpDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  X,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { PayloadViewer } from '../viewer/PayloadViewer';
import { useQueryStore } from '../../stores/queryStore';
import { formatByteSize, formatTimeWithMs, getPayloadSnippet } from '../../lib/formatters';
import type { ReplySample } from '../../types/zenoh';

export interface ReplyTimelineProps {
  sessionId?: string;
  className?: string;
}

export type SortMode = 'latency-asc' | 'latency-desc' | 'time-asc' | 'time-desc';

export const ReplyTimeline: React.FC<ReplyTimelineProps> = ({
  sessionId: _sessionId,
  className = '',
}) => {
  const { getActiveExecution } = useQueryStore();
  const activeExecution = getActiveExecution();

  // Selected reply for inspector
  const [selectedReplyIndex, setSelectedReplyIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('latency-asc');
  const [inspectorExpanded, setInspectorExpanded] = useState<boolean>(false);

  // Active replies list
  const replies = useMemo(() => {
    return activeExecution?.replies || [];
  }, [activeExecution]);

  // Compute aggregate metrics
  const stats = useMemo(() => {
    if (!replies.length) {
      return {
        count: 0,
        minLatency: 0,
        maxLatency: 0,
        avgLatency: 0,
        errorCount: 0,
        totalBytes: 0,
      };
    }

    const latencies = replies.map((r) => r.latency_ms);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const errorCount = replies.filter((r) => r.is_err).length;
    const totalBytes = replies.reduce((sum, r) => sum + (r.payload?.length || 0), 0);

    return {
      count: replies.length,
      minLatency,
      maxLatency,
      avgLatency,
      errorCount,
      totalBytes,
    };
  }, [replies]);

  // Filtered & Sorted replies
  const displayedReplies = useMemo(() => {
    let list = [...replies];

    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const keyMatch = r.key_expr.toLowerCase().includes(q);
        const replierMatch = (r.replier_id || '').toLowerCase().includes(q);
        const snippetMatch = getPayloadSnippet(r.payload, r.encoding).toLowerCase().includes(q);
        return keyMatch || replierMatch || snippetMatch;
      });
    }

    // Sort
    list.sort((a, b) => {
      switch (sortMode) {
        case 'latency-asc':
          return a.latency_ms - b.latency_ms;
        case 'latency-desc':
          return b.latency_ms - a.latency_ms;
        case 'time-asc':
          return a.timestamp - b.timestamp;
        case 'time-desc':
          return b.timestamp - a.timestamp;
        default:
          return 0;
      }
    });

    return list;
  }, [replies, searchQuery, sortMode]);

  // Selected reply object
  const selectedReply: ReplySample | null = useMemo(() => {
    if (selectedReplyIndex === null || !displayedReplies.length) return null;
    return displayedReplies[selectedReplyIndex] || displayedReplies[0] || null;
  }, [displayedReplies, selectedReplyIndex]);

  // Helper for latency badge styling
  const getLatencyBadgeClass = (latency: number) => {
    if (latency < 50) {
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
    }
    if (latency < 200) {
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20';
    }
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20';
  };

  return (
    <div className={`flex flex-col h-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Header & Aggregate Metrics Toolbar */}
      <div className="border-b bg-card px-4 py-3 shrink-0 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Active Query Title */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">
                  Multi-Reply Timeline
                </h3>
                {activeExecution && (
                  <Badge
                    variant={
                      activeExecution.status === 'completed'
                        ? 'success'
                        : activeExecution.status === 'error'
                        ? 'destructive'
                        : 'info'
                    }
                    className="text-[10px] uppercase font-mono px-1.5 py-0"
                  >
                    {activeExecution.status}
                  </Badge>
                )}
              </div>
              {activeExecution ? (
                <div className="font-mono text-xs text-primary font-bold truncate">
                  {activeExecution.selector}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Awaiting query execution…
                </p>
              )}
            </div>
          </div>

          {/* Quick filter & sorting */}
          {replies.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative w-48 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter replies…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs pl-8 pr-7"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div className="flex items-center rounded-md border bg-muted/30 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSortMode(
                      sortMode === 'latency-asc' ? 'latency-desc' : 'latency-asc'
                    )
                  }
                  className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                    sortMode.startsWith('latency')
                      ? 'bg-background font-semibold text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Sort by response latency"
                >
                  <Clock className="w-3 h-3" />
                  <span>Latency {sortMode === 'latency-desc' ? '↓' : '↑'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSortMode(sortMode === 'time-asc' ? 'time-desc' : 'time-asc')
                  }
                  className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                    sortMode.startsWith('time')
                      ? 'bg-background font-semibold text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Sort by timestamp"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>Time {sortMode === 'time-desc' ? '↓' : '↑'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Aggregated Statistics Metrics Bar */}
        {activeExecution && replies.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1 border-t text-xs">
            <div className="rounded bg-muted/40 p-1.5 px-2.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Total Replies
              </div>
              <div className="font-mono text-xs font-bold text-foreground">
                {stats.count}
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Min Latency
              </div>
              <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {stats.minLatency} ms
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Avg Latency
              </div>
              <div className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                {stats.avgLatency} ms
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Max Latency
              </div>
              <div className="font-mono text-xs font-bold text-foreground">
                {stats.maxLatency} ms
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Total Payload
              </div>
              <div className="font-mono text-xs font-bold text-foreground">
                {formatByteSize(stats.totalBytes)}
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Errors
              </div>
              <div
                className={`font-mono text-xs font-bold ${
                  stats.errorCount > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {stats.errorCount}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Split Area: Left Timeline List | Right Inspector */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left: Replies List */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-3 space-y-2">
          {!activeExecution ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6 border border-dashed rounded-xl bg-card/50">
              <Activity className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h4 className="text-sm font-semibold text-foreground">
                No Active Query Execution
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Enter a key expression or selector in the Querier panel and click "Run Query" to inspect live multi-node replies with latency metrics.
              </p>
            </div>
          ) : replies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6 border border-dashed rounded-xl bg-card/50">
              {activeExecution.status === 'running' ? (
                <>
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
                  <h4 className="text-sm font-semibold text-foreground">
                    Gathering Replies…
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    Waiting for distributed Zenoh queryables to respond (timeout: {activeExecution.timeoutMs}ms).
                  </p>
                </>
              ) : activeExecution.status === 'error' ? (
                <>
                  <XCircle className="w-10 h-10 text-destructive mb-3" />
                  <h4 className="text-sm font-semibold text-destructive">
                    Query Error
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1 font-mono">
                    {activeExecution.error || 'Query failed without returning replies.'}
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-10 h-10 text-amber-500/70 mb-3" />
                  <h4 className="text-sm font-semibold text-foreground">
                    No Replies Received
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    No matching queryable or storage replied for selector{' '}
                    <code className="font-mono text-primary font-bold">
                      {activeExecution.selector}
                    </code>{' '}
                    within {activeExecution.timeoutMs}ms.
                  </p>
                </>
              )}
            </div>
          ) : (
            displayedReplies.map((reply, idx) => {
              const isSelected = selectedReply === reply;
              const snippet = getPayloadSnippet(reply.payload, reply.encoding, 100);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedReplyIndex(idx)}
                  className={`flex flex-col gap-2 rounded-lg border p-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  {/* Top Bar: Latency Badge, Key Expression, Replier ID, Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Latency Pill */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono font-bold ${getLatencyBadgeClass(
                          reply.latency_ms
                        )}`}
                      >
                        <Clock className="w-3 h-3" />
                        {reply.latency_ms} ms
                      </span>

                      {/* Replying Key Expression */}
                      <span className="font-mono text-xs font-bold text-foreground truncate">
                        {reply.key_expr}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Replier ID / Node ZID */}
                      {reply.replier_id ? (
                        <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          ZID: {reply.replier_id.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">
                          Anonymous
                        </span>
                      )}

                      {/* Status indicator */}
                      {reply.is_err ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 uppercase">
                          Error
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0 uppercase">
                          OK
                        </Badge>
                      )}

                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Middle: Payload Snippet Preview */}
                  <div className="font-mono text-xs text-muted-foreground bg-background/80 p-1.5 rounded border border-border/50 truncate">
                    {reply.is_err ? (
                      <span className="text-destructive font-semibold">
                        {reply.error_message || 'Queryable returned an error response'}
                      </span>
                    ) : (
                      snippet
                    )}
                  </div>

                  {/* Bottom: Encoding, Payload Size, Timestamp */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono uppercase font-semibold text-primary">
                        {reply.encoding || 'json'}
                      </span>
                      <span>•</span>
                      <span>{formatByteSize(reply.payload?.length || 0)}</span>
                    </div>

                    <div className="font-mono text-[10px]">
                      {formatTimeWithMs(reply.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Reply Inspector Panel (Payload & Metadata) */}
        {selectedReply && (
          <div
            className={`border-l border-border bg-card flex flex-col shrink-0 h-full transition-all duration-200 ${
              inspectorExpanded ? 'w-[640px]' : 'w-[440px]'
            }`}
          >
            {/* Inspector Header */}
            <div className="flex items-center justify-between p-3 border-b bg-muted/20">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Activity className="w-4 h-4 text-primary shrink-0" />
                <span className="font-semibold text-xs tracking-tight uppercase text-foreground truncate">
                  Reply Inspector
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Widen/Narrow */}
                <button
                  type="button"
                  onClick={() => setInspectorExpanded(!inspectorExpanded)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  title={inspectorExpanded ? 'Narrow inspector' : 'Widen inspector'}
                >
                  {inspectorExpanded ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Close */}
                <button
                  type="button"
                  onClick={() => setSelectedReplyIndex(null)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Close inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Reply Overview Metadata */}
            <div className="p-3 border-b bg-muted/10 space-y-2 text-xs">
              {/* Replying Key Expression */}
              <div>
                <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                  Replying Key Expression
                </div>
                <div className="font-mono text-xs font-bold text-foreground break-all bg-background p-1.5 rounded border">
                  {selectedReply.key_expr}
                </div>
              </div>

              {/* Grid: Latency, Replier, Encoding, Size */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Response Latency
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono font-bold border ${getLatencyBadgeClass(
                      selectedReply.latency_ms
                    )}`}
                  >
                    <Clock className="w-3 h-3" />
                    {selectedReply.latency_ms} ms
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Replier Node
                  </div>
                  <div className="font-mono text-xs text-foreground truncate bg-background p-1 rounded border">
                    {selectedReply.replier_id || 'Anonymous'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Payload Size
                  </div>
                  <div className="font-mono text-xs font-medium text-foreground">
                    {formatByteSize(selectedReply.payload?.length || 0)}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      ({selectedReply.payload?.length || 0} bytes)
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Status
                  </div>
                  <div>
                    {selectedReply.is_err ? (
                      <Badge variant="destructive" className="text-xs px-2 py-0.5 uppercase">
                        Error Response
                      </Badge>
                    ) : (
                      <Badge variant="success" className="text-xs px-2 py-0.5 uppercase">
                        Success (200 OK)
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {selectedReply.is_err && selectedReply.error_message && (
                <div className="rounded bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
                  <span className="font-bold">Error Details: </span>
                  {selectedReply.error_message}
                </div>
              )}
            </div>

            {/* Payload Viewer */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">
                Reply Payload Content
              </div>
              <PayloadViewer
                payload={selectedReply.payload}
                encoding={selectedReply.encoding}
                showMetrics={true}
                maxHeight="480px"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReplyTimeline;
