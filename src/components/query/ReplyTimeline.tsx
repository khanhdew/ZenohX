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

  return (
    <div className={`flex flex-col h-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Header & Aggregate Metrics Toolbar */}
      <div className="border-b bg-card px-4 py-2.5 shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Active Query Title */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 rounded-md bg-muted text-muted-foreground shrink-0">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-foreground truncate">
                  Multi-Reply Timeline
                </h3>
                {activeExecution && (
                  <Badge
                    variant={
                      activeExecution.status === 'completed'
                        ? 'secondary'
                        : activeExecution.status === 'error'
                        ? 'destructive'
                        : 'outline'
                    }
                    className="text-[10px] uppercase font-mono px-1.5 py-0"
                  >
                    {activeExecution.status}
                  </Badge>
                )}
              </div>
              {activeExecution ? (
                <div className="font-mono text-xs text-foreground font-medium truncate">
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
                  className="h-7 text-xs pl-8 pr-7 bg-muted/30"
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
              <div className="flex items-center rounded-md border bg-muted p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSortMode(
                      sortMode === 'latency-asc' ? 'latency-desc' : 'latency-asc'
                    )
                  }
                  className={`flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors ${
                    sortMode.startsWith('latency')
                      ? 'bg-background font-medium text-foreground shadow-xs'
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
                  className={`flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors ${
                    sortMode.startsWith('time')
                      ? 'bg-background font-medium text-foreground shadow-xs'
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
            <div className="rounded bg-muted/40 p-1.5 px-2">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Replies
              </div>
              <div className="font-mono text-xs font-semibold text-foreground">
                {stats.count}
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Min Latency
              </div>
              <div className="font-mono text-xs font-semibold text-foreground">
                {stats.minLatency} ms
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Avg Latency
              </div>
              <div className="font-mono text-xs font-semibold text-foreground">
                {stats.avgLatency} ms
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Max Latency
              </div>
              <div className="font-mono text-xs font-semibold text-foreground">
                {stats.maxLatency} ms
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Payload
              </div>
              <div className="font-mono text-xs font-semibold text-foreground">
                {formatByteSize(stats.totalBytes)}
              </div>
            </div>

            <div className="rounded bg-muted/40 p-1.5 px-2">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Errors
              </div>
              <div className="font-mono text-xs font-semibold text-foreground">
                {stats.errorCount}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Split Area: Left Timeline List | Right Inspector */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left: Replies List */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-2.5 space-y-1.5">
          {!activeExecution ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-5 border border-dashed rounded-md bg-muted/10">
              <Activity className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <h4 className="text-xs font-medium text-foreground">
                No Active Query Execution
              </h4>
              <p className="text-[11px] text-muted-foreground max-w-sm mt-0.5">
                Run a query to inspect live replies and latency metrics.
              </p>
            </div>
          ) : replies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-5 border border-dashed rounded-md bg-muted/10">
              {activeExecution.status === 'running' ? (
                <>
                  <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
                  <h4 className="text-xs font-medium text-foreground">
                    Gathering Replies…
                  </h4>
                  <p className="text-[11px] text-muted-foreground max-w-sm mt-0.5">
                    Waiting for distributed Zenoh queryables to respond (timeout: {activeExecution.timeoutMs}ms).
                  </p>
                </>
              ) : activeExecution.status === 'error' ? (
                <>
                  <XCircle className="w-8 h-8 text-destructive mb-2" />
                  <h4 className="text-xs font-medium text-destructive">
                    Query Error
                  </h4>
                  <p className="text-[11px] text-muted-foreground max-w-sm mt-0.5 font-mono">
                    {activeExecution.error || 'Query failed without returning replies.'}
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
                  <h4 className="text-xs font-medium text-foreground">
                    No Replies Received
                  </h4>
                  <p className="text-[11px] text-muted-foreground max-w-sm mt-0.5">
                    No matching queryable replied within {activeExecution.timeoutMs}ms.
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
                  className={`flex flex-col gap-1.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-foreground/30 bg-muted/60'
                      : 'border-transparent bg-card hover:bg-muted/40'
                  }`}
                >
                  {/* Top Bar: Latency Badge, Key Expression, Replier ID, Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Latency Pill */}
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-medium">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {reply.latency_ms} ms
                      </span>

                      {/* Replying Key Expression */}
                      <span className="font-mono text-xs font-medium text-foreground truncate">
                        {reply.key_expr}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Replier ID */}
                      {reply.replier_id ? (
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          ZID: {reply.replier_id.slice(0, 8)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">
                          Anonymous
                        </span>
                      )}

                      {/* Status indicator */}
                      {reply.is_err ? (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0 uppercase">
                          Error
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 uppercase">
                          OK
                        </Badge>
                      )}

                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Middle: Payload Snippet Preview */}
                  <div className="font-mono text-xs text-muted-foreground bg-muted/40 p-1.5 rounded truncate">
                    {reply.is_err ? (
                      <span className="text-destructive font-medium">
                        {reply.error_message || 'Queryable returned an error response'}
                      </span>
                    ) : (
                      snippet
                    )}
                  </div>

                  {/* Bottom: Encoding, Payload Size, Timestamp */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="uppercase">{reply.encoding || 'json'}</span>
                      <span>•</span>
                      <span>{formatByteSize(reply.payload?.length || 0)}</span>
                    </div>

                    <div className="font-mono">
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
              inspectorExpanded ? 'w-[580px]' : 'w-[380px]'
            }`}
          >
            {/* Inspector Header */}
            <div className="flex items-center justify-between p-2.5 border-b bg-muted/20">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold text-xs text-foreground truncate">
                  Reply Inspector
                </span>
              </div>

              <div className="flex items-center gap-1">
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

                <button
                  type="button"
                  onClick={() => setSelectedReplyIndex(null)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Close inspector"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Reply Overview Metadata */}
            <div className="p-3 border-b bg-muted/10 space-y-2 text-xs">
              {/* Replying Key Expression */}
              <div>
                <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                  Key Expression
                </div>
                <div className="font-mono text-xs font-medium text-foreground break-all bg-muted/40 p-1.5 rounded border">
                  {selectedReply.key_expr}
                </div>
              </div>

              {/* Grid: Latency, Replier, Encoding, Size */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Latency
                  </div>
                  <div className="font-mono text-xs font-medium text-foreground">
                    {selectedReply.latency_ms} ms
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Replier Node
                  </div>
                  <div className="font-mono text-xs text-foreground truncate bg-muted/30 p-1 rounded border">
                    {selectedReply.replier_id || 'Anonymous'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Payload Size
                  </div>
                  <div className="font-mono text-xs font-medium text-foreground">
                    {formatByteSize(selectedReply.payload?.length || 0)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                    Status
                  </div>
                  <div>
                    {selectedReply.is_err ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 uppercase">
                        Error
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase">
                        OK
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {selectedReply.is_err && selectedReply.error_message && (
                <div className="rounded bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
                  <span className="font-semibold">Error: </span>
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
