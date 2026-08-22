import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Trash2,
  Pause,
  Play,
  ArrowDown,
  Filter,
  Radio,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { useMessageStore } from '../../stores/messageStore';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  formatByteSize,
  formatTimeWithMs,
  getPayloadSnippet,
} from '../../lib/formatters';
import type { MessageItem } from '../../types/zenoh';

export interface MessageListProps {
  sessionId?: string;
  profileId?: string;
  onSelectMessage?: (msg: MessageItem | null) => void;
  className?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  sessionId: propSessionId,
  profileId: propProfileId,
  onSelectMessage,
  className = '',
}) => {
  const {
    messages,
    subscriptions,
    activeFilterKey,
    searchQuery,
    selectedMessage,
    clearMessages,
    selectMessage,
    setActiveFilterKey,
    setSearchQuery,
  } = useMessageStore();

  const { getActiveSessionId, selectedProfileId } = useConnectionStore();

  const activeSessionId = propSessionId || getActiveSessionId(propProfileId || selectedProfileId || undefined);

  // Direction Filter State ('all' | 'incoming' | 'outgoing')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');

  // Stream Pause / Auto-scroll controls
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [pausedMessageCount, setPausedMessageCount] = useState<number>(0);

  // Parent scroll container ref for virtualizer
  const parentRef = useRef<HTMLDivElement>(null);

  // Snapshot of messages when paused
  const [frozenMessages, setFrozenMessages] = useState<MessageItem[]>([]);

  // Filter messages based on active session, key expression, text search query, and direction
  const filteredMessages = useMemo(() => {
    const sourceList = isPaused ? frozenMessages : messages;

    return sourceList.filter((m) => {
      // 1. Session filter
      if (activeSessionId && m.sessionId && m.sessionId !== activeSessionId) {
        return false;
      }

      // 2. Direction filter
      if (directionFilter !== 'all' && m.direction !== directionFilter) {
        return false;
      }

      // 3. Key expression active filter
      if (activeFilterKey) {
        const cleanFilter = activeFilterKey.replace(/\*\*?$/, '');
        if (!m.keyExpr.includes(cleanFilter)) {
          return false;
        }
      }

      // 4. Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchKey = m.keyExpr.toLowerCase().includes(q);
        if (matchKey) return true;

        try {
          const str = new TextDecoder().decode(new Uint8Array(m.payload));
          if (str.toLowerCase().includes(q)) return true;
        } catch {
          // Ignore decode error
        }

        return false;
      }

      return true;
    });
  }, [
    messages,
    frozenMessages,
    isPaused,
    activeSessionId,
    directionFilter,
    activeFilterKey,
    searchQuery,
  ]);

  // Handle Pause / Resume toggle
  const handleTogglePause = () => {
    if (!isPaused) {
      // Freezing current view
      setFrozenMessages([...messages]);
      setPausedMessageCount(0);
      setIsPaused(true);
    } else {
      setIsPaused(false);
      setFrozenMessages([]);
      setPausedMessageCount(0);
    }
  };

  // Track incoming messages count while paused
  useEffect(() => {
    if (isPaused) {
      setPausedMessageCount((prev) => prev + 1);
    }
  }, [messages, isPaused]);

  // Virtualizer instance
  const rowVirtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 10,
  });

  // Auto-scroll to latest message when new messages arrive (if enabled and not paused)
  useEffect(() => {
    if (autoScroll && !isPaused && filteredMessages.length > 0) {
      rowVirtualizer.scrollToIndex(filteredMessages.length - 1, { align: 'end' });
    }
  }, [filteredMessages.length, autoScroll, isPaused, rowVirtualizer]);

  // Subscription color lookup mapping
  const subColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const sub of subscriptions) {
      if (sub.colorTag) {
        map.set(sub.keyExpr, sub.colorTag);
      }
    }
    return map;
  }, [subscriptions]);

  // Selection handler
  const handleItemClick = useCallback(
    (item: MessageItem) => {
      const next = selectedMessage?.id === item.id ? null : item;
      selectMessage(next);
      if (onSelectMessage) {
        onSelectMessage(next);
      }
    },
    [selectedMessage, selectMessage, onSelectMessage]
  );

  const handleClearAll = () => {
    clearMessages(activeSessionId || undefined);
    if (onSelectMessage) {
      onSelectMessage(null);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-card text-card-foreground ${className}`}>
      {/* Top Toolbar */}
      <div className="p-3 border-b bg-muted/20 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Title, Counter & Direction Tabs */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs tracking-tight uppercase text-foreground">
              Message Feed
            </span>

            {/* Total count badge */}
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
              {filteredMessages.length}
            </Badge>

            {/* Direction Filter Segmented Buttons */}
            <div className="flex items-center rounded-md border bg-background p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDirectionFilter('all')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  directionFilter === 'all'
                    ? 'bg-muted text-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter('incoming')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  directionFilter === 'incoming'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                IN
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter('outgoing')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  directionFilter === 'outgoing'
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                OUT
              </button>
            </div>
          </div>

          {/* Right Controls: Pause, Auto-scroll Lock, Clear */}
          <div className="flex items-center gap-1.5">
            {/* Pause / Resume Live Stream Button */}
            <Button
              type="button"
              variant={isPaused ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleTogglePause}
              className={`h-7 px-2 text-xs gap-1 ${
                isPaused
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                  : ''
              }`}
              title={isPaused ? 'Resume live message stream' : 'Pause live message stream'}
            >
              {isPaused ? (
                <>
                  <Play className="w-3 h-3" />
                  Resume {pausedMessageCount > 0 && `(+${pausedMessageCount})`}
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3" />
                  Pause
                </>
              )}
            </Button>

            {/* Auto-scroll to Bottom Toggle */}
            <Button
              type="button"
              variant={autoScroll ? 'secondary' : 'ghost'}
              size="iconSm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`h-7 w-7 ${
                autoScroll
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={autoScroll ? 'Auto-scroll to latest enabled' : 'Auto-scroll disabled'}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </Button>

            {/* Clear Messages */}
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              onClick={handleClearAll}
              disabled={filteredMessages.length === 0}
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Clear all messages in view"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Bottom Search & Filter Pill Bar */}
        <div className="flex items-center gap-2">
          {/* Search Input Box */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by key expression or payload content..."
              className="h-8 pl-8 text-xs bg-background"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Active Key Expression Filter Pill */}
          {activeFilterKey && (
            <div className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary font-mono shrink-0">
              <Filter className="w-3 h-3" />
              <span className="truncate max-w-[160px] font-semibold">{activeFilterKey}</span>
              <button
                type="button"
                onClick={() => setActiveFilterKey('')}
                className="hover:opacity-75 ml-0.5"
                title="Clear key expression filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Paused Stream Alert Banner */}
      {isPaused && (
        <div className="flex items-center justify-between bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-1.5">
            <Pause className="w-3.5 h-3.5 shrink-0" />
            <span>
              Live feed paused.{' '}
              {pausedMessageCount > 0
                ? `${pausedMessageCount} new incoming message${pausedMessageCount === 1 ? '' : 's'} buffered.`
                : 'Showing static snapshot.'}
            </span>
          </div>
          <button
            onClick={handleTogglePause}
            className="font-semibold underline hover:opacity-80"
          >
            Resume Stream
          </button>
        </div>
      )}

      {/* Virtualized Message Feed Container */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto relative select-none p-1.5 focus:outline-none"
        tabIndex={0}
      >
        {filteredMessages.length === 0 ? (
          /* Empty Feed State */
          <div className="flex flex-col items-center justify-center text-center p-8 space-y-3 mt-12 text-muted-foreground">
            <div className="p-3.5 rounded-full bg-muted/60 text-muted-foreground">
              <Radio className="w-7 h-7 opacity-40 animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground/90">
                {searchQuery || activeFilterKey
                  ? 'No matching messages found'
                  : 'Waiting for Zenoh messages...'}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
                {searchQuery || activeFilterKey
                  ? 'Try clearing the search query or active key expression filter.'
                  : 'Published and subscribed samples will appear here in real-time.'}
              </p>
            </div>
          </div>
        ) : (
          /* Virtual items list */
          <div
            className="w-full relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = filteredMessages[virtualItem.index];
              if (!item) return null;

              const isSelected = selectedMessage?.id === item.id;
              const isIncoming = item.direction === 'incoming';
              const isDelete = item.kind === 'delete';
              const colorTag = subColorMap.get(item.keyExpr);
              const snippet = getPayloadSnippet(item.payload, item.encoding);
              const byteSize = item.payload ? item.payload.length : 0;

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  onClick={() => handleItemClick(item)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="pb-1"
                >
                  <div
                    className={`rounded-md border px-2.5 py-1.5 text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40'
                        : 'border-border/70 bg-card hover:bg-muted/40 hover:border-muted-foreground/30'
                    }`}
                  >
                    {/* Top Row: Timestamp, Direction Badge, Key Expression, Encoding, Size */}
                    <div className="flex items-center justify-between gap-1.5 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {/* Timestamp */}
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatTimeWithMs(item.timestamp)}
                        </span>

                        {/* Direction Badge */}
                        <span
                          className={`inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                            isIncoming
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft className="w-2.5 h-2.5" />
                          ) : (
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          )}
                          {isIncoming ? 'IN' : 'OUT'}
                        </span>

                        {/* Delete Kind Badge */}
                        {isDelete && (
                          <span className="rounded bg-destructive/15 text-destructive border border-destructive/20 px-1 py-0.2 text-[9px] font-bold uppercase shrink-0">
                            DEL
                          </span>
                        )}

                        {/* Color Dot if subscription matches */}
                        {colorTag && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: colorTag }}
                          />
                        )}

                        {/* Key Expression */}
                        <span
                          className="font-semibold text-foreground truncate max-w-[280px]"
                          title={item.keyExpr}
                        >
                          {item.keyExpr}
                        </span>
                      </div>

                      {/* Right Meta: Encoding & Byte Size */}
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
                        <span className="uppercase rounded bg-muted px-1 py-0.2 font-mono">
                          {item.encoding || 'raw'}
                        </span>
                        <span>{formatByteSize(byteSize)}</span>
                      </div>
                    </div>

                    {/* Bottom Row: Truncated Payload Preview */}
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground/90 truncate pl-0.5">
                      <span className="text-foreground/80">{snippet}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info Status Bar */}
      <div className="p-2 border-t bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {filteredMessages.length} message{filteredMessages.length === 1 ? '' : 's'} in view
          </span>
          {selectedMessage && (
            <span className="text-primary font-medium">
              (1 message selected)
            </span>
          )}
        </div>

        {selectedMessage && (
          <button
            type="button"
            onClick={() => {
              selectMessage(null);
              if (onSelectMessage) onSelectMessage(null);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Clear Selection
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageList;
