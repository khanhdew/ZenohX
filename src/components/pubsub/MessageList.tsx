import React, { useRef, useState, useMemo, useEffect } from 'react';
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
  getTopicColorTag,
  normalizeEncoding,
} from '../../lib/formatters';
import { JsonHighlightedCode } from '../viewer/PayloadViewer';
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

      // 2. Profile filter
      const currentProfileId = propProfileId || selectedProfileId;
      if (currentProfileId && m.profileId && m.profileId !== currentProfileId) {
        return false;
      }

      // 3. Direction filter
      if (directionFilter !== 'all' && m.direction !== directionFilter) {
        return false;
      }

      // 4. Key expression active filter
      if (activeFilterKey) {
        const cleanFilter = activeFilterKey.replace(/\*\*?$/, '');
        if (!m.keyExpr.includes(cleanFilter)) {
          return false;
        }
      }

      // 5. Text search query
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
    propProfileId,
    selectedProfileId,
    directionFilter,
    activeFilterKey,
    searchQuery,
  ]);

  // Handle Pause / Resume toggle
  const handleTogglePause = () => {
    if (!isPaused) {
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
    estimateSize: () => 56,
    overscan: 10,
  });

  // Auto-scroll to latest message when new messages arrive
  useEffect(() => {
    if (autoScroll && !isPaused && filteredMessages.length > 0 && parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, [filteredMessages.length, autoScroll, isPaused]);

  const handleClearAll = () => {
    const currentProfileId = propProfileId || selectedProfileId;
    clearMessages(activeSessionId || undefined, currentProfileId || undefined);
    selectMessage(null);
    if (onSelectMessage) onSelectMessage(null);
  };

  const handleItemClick = (msg: MessageItem) => {
    const newSelected = selectedMessage?.id === msg.id ? null : msg;
    selectMessage(newSelected);
    if (onSelectMessage) onSelectMessage(newSelected);
  };

  return (
    <div className={`flex flex-col h-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Controls Toolbar */}
      <div className="p-2.5 border-b bg-card space-y-2 select-none">
        {/* Upper Toolbar: Direction Tabs, Pause/Resume, Auto-scroll lock, Clear */}
        <div className="flex items-center justify-between gap-2">
          {/* Direction Filter Pill Group */}
          <div className="flex items-center rounded-md bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDirectionFilter('all')}
              className={`rounded-sm px-2.5 py-1 font-medium transition-colors ${
                directionFilter === 'all'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({filteredMessages.length})
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('incoming')}
              className={`flex items-center gap-1 rounded-sm px-2 py-1 font-medium transition-colors ${
                directionFilter === 'incoming'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowDownLeft className="w-3 h-3 text-muted-foreground" />
              In
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('outgoing')}
              className={`flex items-center gap-1 rounded-sm px-2 py-1 font-medium transition-colors ${
                directionFilter === 'outgoing'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
              Out
            </button>
          </div>

          {/* Right Action Controls: Pause, Auto-scroll, Clear */}
          <div className="flex items-center gap-1">
            {/* Pause / Resume Live Stream */}
            <Button
              type="button"
              variant={isPaused ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleTogglePause}
              className="h-7 px-2 text-xs gap-1"
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
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
              className="h-7 pl-7 text-xs bg-muted/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Active Key Expression Filter Pill */}
          {activeFilterKey && (
            <div className="flex items-center gap-1.5 rounded-md border bg-muted px-2 py-0.5 text-xs text-foreground font-mono shrink-0">
              <Filter className="w-3 h-3 text-muted-foreground" />
              <span className="truncate max-w-[160px] font-medium">{activeFilterKey}</span>
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
        <div className="flex items-center justify-between bg-muted/50 border-b px-3 py-1 text-xs text-muted-foreground">
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
            className="font-medium underline hover:opacity-80"
          >
            Resume
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
          <div className="flex flex-col items-center justify-center text-center p-8 space-y-2.5 mt-12 text-muted-foreground">
            <div className="p-3 rounded-full bg-muted text-muted-foreground">
              <Radio className="w-6 h-6 opacity-40" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                {searchQuery || activeFilterKey
                  ? 'No matching messages found'
                  : 'Waiting for messages...'}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
                {searchQuery || activeFilterKey
                  ? 'Try clearing the search query or active filter.'
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
              const byteSize = item.payload?.length || 0;
              const effectiveEncoding = normalizeEncoding(item.encoding, item.payload);
              const snippet = getPayloadSnippet(item.payload, effectiveEncoding);
              const effectiveProfileId = item.profileId || propProfileId || selectedProfileId;
              const { color: colorTag, matchedSub } = getTopicColorTag(
                subscriptions,
                item.keyExpr,
                item.direction,
                effectiveProfileId,
                item.sessionId || activeSessionId
              );

              return (
                <div
                  key={item.id || virtualItem.key}
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
                    style={
                      isIncoming
                        ? { borderLeftColor: colorTag, borderLeftWidth: '3px' }
                        : { borderRightColor: colorTag, borderRightWidth: '3px' }
                    }
                    className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-foreground/40 bg-muted/70'
                        : 'border-transparent bg-card hover:bg-muted/40'
                    }`}
                  >
                    {/* Top Row: Timestamp, Direction Badge, Key Expression, Encoding, Size */}
                    <div className="flex items-center justify-between gap-1.5 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {/* Timestamp */}
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatTimeWithMs(item.timestamp)}
                        </span>

                        {/* Direction Badge (IN = Blue/Sky, OUT = Purple) */}
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0 border ${
                            isIncoming
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                          }`}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft className="w-2.5 h-2.5 mr-0.5 inline-block text-sky-500" />
                          ) : (
                            <ArrowUpRight className="w-2.5 h-2.5 mr-0.5 inline-block text-purple-500" />
                          )}
                          {isIncoming ? 'IN' : 'OUT'}
                        </Badge>

                        {/* Delete Kind Badge */}
                        {isDelete && (
                          <Badge variant="destructive" className="text-[9px] font-mono px-1 py-0 uppercase">
                            DEL
                          </Badge>
                        )}

                        {/* Topic Color Indicator Dot */}
                        <span
                          className="h-2 w-2 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: colorTag }}
                          title={
                            matchedSub
                              ? `Matched subscription: ${matchedSub.keyExpr} (${colorTag})`
                              : `Topic color: ${colorTag}`
                          }
                        />

                        {/* Key Expression (Topic Name) */}
                        <span
                          className="font-medium text-foreground truncate"
                          title={item.keyExpr}
                        >
                          {item.keyExpr}
                        </span>
                      </div>

                      {/* Right Meta: Encoding & Byte Size */}
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
                        <span className="uppercase rounded bg-muted px-1 py-0.2 font-mono text-[9px]">
                          {effectiveEncoding}
                        </span>
                        <span>{formatByteSize(byteSize)}</span>
                      </div>
                    </div>

                    {/* Bottom Row: Truncated Payload Preview with Syntax Highlighting */}
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate pl-0.5">
                      {effectiveEncoding === 'json' || effectiveEncoding === 'cbor' || (snippet.startsWith('{') && snippet.endsWith('}')) || (snippet.startsWith('[') && snippet.endsWith(']')) ? (
                        <span className="truncate inline-block max-w-full">
                          <JsonHighlightedCode code={snippet} />
                        </span>
                      ) : (
                        <span className="text-foreground/80">{snippet}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info Status Bar */}
      <div className="p-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {filteredMessages.length} message{filteredMessages.length === 1 ? '' : 's'} in view
          </span>
          {selectedMessage && (
            <span className="text-foreground font-medium">
              (1 selected)
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
