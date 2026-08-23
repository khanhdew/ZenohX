import React from 'react';
import {
  Search,
  Database as DbIcon,
  FileCode,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { PayloadViewer } from '../../viewer/PayloadViewer';
import { useConnectionStore } from '../../../stores/connectionStore';
import type { StoredMessage, EncodingType } from '../../../types/zenoh';

export interface HistoryTabProps {
  historyProfileId: string;
  setHistoryProfileId: (id: string) => void;
  historyLimit: number;
  setHistoryLimit: (limit: number) => void;
  isLoadingHistory: boolean;
  historyError: string | null;
  searchHistory: string;
  setSearchHistory: (val: string) => void;
  filteredHistory: StoredMessage[];
  selectedMessage: StoredMessage | null;
  setSelectedMessage: (msg: StoredMessage | null) => void;
  onReload: () => void;
  onClearHistory?: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  historyProfileId,
  setHistoryProfileId,
  historyLimit,
  setHistoryLimit,
  isLoadingHistory,
  historyError,
  searchHistory,
  setSearchHistory,
  filteredHistory,
  selectedMessage,
  setSelectedMessage,
  onReload,
  onClearHistory,
}) => {
  const profiles = useConnectionStore((state) => state.profiles);

  return (
    <div className="h-full flex flex-col md:flex-row min-h-0 overflow-hidden">
      {/* Left: Filter Controls & History Message List */}
      <div className="w-full md:w-[440px] shrink-0 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-border flex flex-col overflow-hidden">
        {/* Filter toolbar */}
        <div className="p-3 border-b bg-muted/20 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Filter by Profile
              </label>
              <Select
                value={historyProfileId || '__all__'}
                onValueChange={(val) => setHistoryProfileId(val === '__all__' ? '' : val)}
              >
                <SelectTrigger className="w-full h-8 text-xs font-medium">
                  <SelectValue placeholder="All Profiles (Global)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs">All Profiles (Global)</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} ({p.mode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-28">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                Limit
              </label>
              <Select
                value={String(historyLimit)}
                onValueChange={(val) => setHistoryLimit(Number(val))}
              >
                <SelectTrigger className="w-full h-8 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20" className="text-xs font-mono">20</SelectItem>
                  <SelectItem value="50" className="text-xs font-mono">50</SelectItem>
                  <SelectItem value="100" className="text-xs font-mono">100</SelectItem>
                  <SelectItem value="500" className="text-xs font-mono">500</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={onReload}
                disabled={isLoadingHistory}
                className="h-7 w-7 p-0"
                title="Reload from SQLite"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              </Button>
              {onClearHistory && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onClearHistory}
                  disabled={isLoadingHistory || filteredHistory.length === 0}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  title="Clear message history from SQLite"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Search query input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchHistory}
              onChange={(e) => setSearchHistory(e.target.value)}
              placeholder="Search by topic or hex bytes..."
              className="h-7 pl-7 text-xs bg-muted/40"
            />
            {searchHistory && (
              <button
                onClick={() => setSearchHistory('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Message List Feed */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading SQLite history...
            </div>
          ) : historyError ? (
            <div className="p-4 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{historyError}</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-2">
              <DbIcon className="w-6 h-6 opacity-40" />
              <p className="text-xs font-medium text-foreground">No Stored Messages Found</p>
              <p className="text-[11px] max-w-xs leading-relaxed">
                Publish samples or receive subscribed messages to persist them to the local SQLite database.
              </p>
            </div>
          ) : (
            filteredHistory.map((item) => {
              const isSelected = selectedMessage?.id === item.id;
              const isIncoming = item.direction === 'incoming';
              const isDelete = item.kind === 'delete';
              const byteSize = item.payload ? item.payload.length : 0;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedMessage(item)}
                  className={`rounded-md border p-2 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-foreground/30 bg-muted/60'
                      : 'border-transparent hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[9px] font-mono uppercase px-1 py-0"
                      >
                        {isIncoming ? (
                          <ArrowDownLeft className="w-2.5 h-2.5 mr-0.5 inline-block" />
                        ) : (
                          <ArrowUpRight className="w-2.5 h-2.5 mr-0.5 inline-block" />
                        )}
                        {isIncoming ? 'IN' : 'OUT'}
                      </Badge>
                      {isDelete && (
                        <Badge variant="destructive" className="text-[9px] font-mono px-1 py-0 uppercase">
                          DEL
                        </Badge>
                      )}
                      <span className="font-semibold text-foreground truncate max-w-[220px]">
                        {item.key_expr}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
                      <span className="uppercase font-mono text-[9px] bg-muted px-1 rounded">
                        {item.encoding}
                      </span>
                      <span>{byteSize} B</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Message Payload Detail Inspector */}
      <div className="flex-1 h-1/2 md:h-full flex flex-col min-h-0 overflow-hidden bg-background">
        {selectedMessage ? (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b bg-card space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Message Details</span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {new Date(selectedMessage.timestamp).toISOString()}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="text-muted-foreground">Topic:</span>
                <span className="font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                  {selectedMessage.key_expr}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden p-2">
              <PayloadViewer
                payload={selectedMessage.payload}
                encoding={selectedMessage.encoding as EncodingType}
                maxHeight="100%"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
            <FileCode className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs font-medium text-foreground">No Message Selected</p>
            <p className="text-[11px]">Select a historical message from the left to inspect its payload.</p>
          </div>
        )}
      </div>
    </div>
  );
};
