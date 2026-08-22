import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Database as DbIcon,
  Keyboard,
  RefreshCw,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  HardDrive,
  FileCode,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { useConnectionStore } from '../../stores/connectionStore';
import { queryMessages } from '../../lib/tauri';
import { formatByteSize, formatTimeWithMs } from '../../lib/formatters';
import { PayloadViewer } from '../viewer/PayloadViewer';
import type { StoredMessage } from '../../types/zenoh';

export interface SettingsWorkspaceProps {
  className?: string;
}

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({ className = '' }) => {
  const {
    profiles,
    selectedProfileId,
    activeSessions,
    getSelectedProfile,
  } = useConnectionStore();

  const selectedProfile = getSelectedProfile();
  const [activeTab, setActiveTab] = useState<'history' | 'diagnostics' | 'shortcuts'>('history');

  // History query state
  const [historyProfileId, setHistoryProfileId] = useState<string>(selectedProfileId || (profiles[0]?.id ?? ''));
  const [historyMessages, setHistoryMessages] = useState<StoredMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [selectedStoredMsg, setSelectedStoredMsg] = useState<StoredMessage | null>(null);

  // Sync history profile when selected profile changes if not set
  useEffect(() => {
    if (selectedProfileId && !historyProfileId) {
      setHistoryProfileId(selectedProfileId);
    }
  }, [selectedProfileId, historyProfileId]);

  // Load history messages from SQLite
  const loadMessageHistory = async (profileId: string) => {
    if (!profileId) return;
    setIsLoadingHistory(true);
    try {
      const msgs = await queryMessages(profileId, 200, 0);
      setHistoryMessages(msgs);
      if (msgs.length > 0 && !selectedStoredMsg) {
        setSelectedStoredMsg(msgs[0]);
      }
    } catch (err) {
      console.error('Failed to query message history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (historyProfileId) {
      loadMessageHistory(historyProfileId);
    }
  }, [historyProfileId]);

  const filteredHistory = useMemo(() => {
    if (!searchHistory.trim()) return historyMessages;
    const q = searchHistory.toLowerCase().trim();
    return historyMessages.filter((m) => {
      const matchKey = m.key_expr.toLowerCase().includes(q);
      const matchEnc = m.encoding.toLowerCase().includes(q);
      let matchPayload = false;
      try {
        const text = new TextDecoder().decode(new Uint8Array(m.payload));
        matchPayload = text.toLowerCase().includes(q);
      } catch {
        // ignore
      }
      return matchKey || matchEnc || matchPayload;
    });
  }, [historyMessages, searchHistory]);

  const activeSessionCount = Object.keys(activeSessions).length;

  return (
    <div className={`flex flex-col h-full w-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Header */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-2 select-none shrink-0">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold text-foreground">
            Settings & History
          </h2>
          <Badge variant="secondary" className="text-[10px] font-mono">
            SQLite
          </Badge>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Message Log</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diagnostics')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'diagnostics'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <DbIcon className="w-3.5 h-3.5" />
            <span>System Status</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shortcuts')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'shortcuts'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Shortcuts</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'history' && (
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
                    <select
                      value={historyProfileId}
                      onChange={(e) => setHistoryProfileId(e.target.value)}
                      className="w-full h-7 text-xs rounded border border-input bg-background px-2 font-medium"
                    >
                      <option value="" disabled>
                        Select Profile...
                      </option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.mode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadMessageHistory(historyProfileId)}
                    disabled={isLoadingHistory || !historyProfileId}
                    className="h-7 mt-3 text-xs gap-1"
                    title="Reload message history"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={searchHistory}
                    onChange={(e) => setSearchHistory(e.target.value)}
                    placeholder="Search key expr or text..."
                    className="h-7 pl-8 text-xs bg-muted/30"
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

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center h-40 text-xs text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mb-2" />
                    Loading history...
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center text-xs text-muted-foreground p-5 border border-dashed rounded-md m-2 bg-muted/10">
                    <History className="w-6 h-6 mb-2 opacity-40" />
                    <p className="font-medium text-foreground">No historical messages found</p>
                    <p className="text-[11px] mt-0.5">
                      Messages stored in SQLite will appear here.
                    </p>
                  </div>
                ) : (
                  filteredHistory.map((m, idx) => {
                    const isSelected = selectedStoredMsg === m;
                    return (
                      <div
                        key={m.id || idx}
                        onClick={() => setSelectedStoredMsg(m)}
                        className={`p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-foreground/30 bg-muted/60'
                            : 'border-transparent bg-card hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Badge
                              variant="secondary"
                              className="text-[9px] font-mono uppercase px-1 py-0"
                            >
                              {m.direction === 'incoming' ? (
                                <ArrowDownLeft className="w-2.5 h-2.5 mr-0.5 inline-block" />
                              ) : (
                                <ArrowUpRight className="w-2.5 h-2.5 mr-0.5 inline-block" />
                              )}
                              {m.direction}
                            </Badge>
                            <span className="font-mono text-xs font-medium truncate text-foreground">
                              {m.key_expr}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                            {formatTimeWithMs(m.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                          <span>Encoding: {m.encoding || 'raw'}</span>
                          <span>{formatByteSize(m.payload?.length || 0)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Message Payload Inspector */}
            <div className="flex-1 min-w-0 h-1/2 md:h-full flex flex-col overflow-hidden bg-card">
              {selectedStoredMsg ? (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <div className="p-2.5 border-b bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">
                        Payload Inspector
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono uppercase">
                      {selectedStoredMsg.encoding || 'raw'}
                    </Badge>
                  </div>

                  <div className="p-2.5 border-b bg-muted/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                        Topic Key
                      </span>
                      <span className="font-mono text-[11px] font-medium truncate block">
                        {selectedStoredMsg.key_expr}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                        Direction / Kind
                      </span>
                      <span className="font-mono text-[11px] uppercase font-medium">
                        {selectedStoredMsg.direction} ({selectedStoredMsg.kind})
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                        Timestamp
                      </span>
                      <span className="font-mono text-[11px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {formatTimeWithMs(selectedStoredMsg.timestamp)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                        Size
                      </span>
                      <span className="font-mono text-[11px] font-medium">
                        {formatByteSize(selectedStoredMsg.payload?.length || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 p-3 overflow-y-auto">
                    <PayloadViewer
                      payload={selectedStoredMsg.payload}
                      encoding={selectedStoredMsg.encoding}
                      showMetrics={true}
                      maxHeight="520px"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-xs text-muted-foreground p-6">
                  <FileCode className="w-8 h-8 opacity-30 mb-2" />
                  <p>Select a message to inspect its payload</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div className="h-full overflow-y-auto p-5 max-w-4xl space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <DbIcon className="w-4 h-4 text-muted-foreground" />
                System Diagnostics
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Overview of local storage, active Zenoh transport links, and configured profiles.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-md border bg-card space-y-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  Configured Profiles
                </span>
                <div className="text-xl font-bold font-mono text-foreground">
                  {profiles.length}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Stored in SQLite database
                </span>
              </div>

              <div className="p-3.5 rounded-md border bg-card space-y-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  Active Sessions
                </span>
                <div className="text-xl font-bold font-mono text-foreground">
                  {activeSessionCount}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Concurrent Zenoh sessions
                </span>
              </div>

              <div className="p-3.5 rounded-md border bg-card space-y-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  Selected Profile
                </span>
                <div className="text-xs font-semibold text-foreground truncate">
                  {selectedProfile?.name || 'None selected'}
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Mode: {selectedProfile?.mode || 'N/A'}
                </span>
              </div>
            </div>

            {/* Application Environment Card */}
            <div className="p-3.5 rounded-md border bg-card space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                ZenohX System Information
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2 rounded bg-muted/40">
                  <span className="text-[10px] uppercase font-medium text-muted-foreground block">
                    Version
                  </span>
                  <span className="font-mono font-medium">v0.1.0 (MVP)</span>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <span className="text-[10px] uppercase font-medium text-muted-foreground block">
                    Eclipse Zenoh Core
                  </span>
                  <span className="font-mono font-medium">1.10.0</span>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <span className="text-[10px] uppercase font-medium text-muted-foreground block">
                    Storage Engine
                  </span>
                  <span className="font-mono font-medium">SQLite 3 (Bundled)</span>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <span className="text-[10px] uppercase font-medium text-muted-foreground block">
                    Desktop Runtime
                  </span>
                  <span className="font-mono font-medium">Tauri 2.0 + Rust</span>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <span className="text-[10px] uppercase font-medium text-muted-foreground block">
                    Frontend UI
                  </span>
                  <span className="font-mono font-medium">React 18 + TailwindCSS</span>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <span className="text-[10px] uppercase font-medium text-muted-foreground block">
                    Payload Codecs
                  </span>
                  <span className="font-mono font-medium">JSON, CBOR, Text, Hex</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'shortcuts' && (
          <div className="h-full overflow-y-auto p-5 max-w-2xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-muted-foreground" />
                Keyboard Shortcuts
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quick desktop navigation shortcuts.
              </p>
            </div>

            <div className="rounded-md border bg-card overflow-hidden divide-y divide-border">
              <div className="p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">Switch to Pub / Sub Workspace</span>
                  <p className="text-[11px] text-muted-foreground">Jump directly to topic message stream</p>
                </div>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono border">Ctrl / ⌘ + 1</kbd>
              </div>

              <div className="p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">Switch to Query / RPC Workspace</span>
                  <p className="text-[11px] text-muted-foreground">Jump to querier, timeline & queryables</p>
                </div>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono border">Ctrl / ⌘ + 2</kbd>
              </div>

              <div className="p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">Switch to Settings & History</span>
                  <p className="text-[11px] text-muted-foreground">Inspect SQLite history & app diagnostics</p>
                </div>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono border">Ctrl / ⌘ + 3</kbd>
              </div>

              <div className="p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">Toggle Left Sidebar</span>
                  <p className="text-[11px] text-muted-foreground">Collapse or expand connections panel</p>
                </div>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono border">Ctrl / ⌘ + B</kbd>
              </div>

              <div className="p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">Scout Local Network</span>
                  <p className="text-[11px] text-muted-foreground">Discover routers and peers on LAN</p>
                </div>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono border">Ctrl / ⌘ + K</kbd>
              </div>

              <div className="p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">New Connection Profile</span>
                  <p className="text-[11px] text-muted-foreground">Open profile creation dialog</p>
                </div>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono border">Ctrl / ⌘ + N</kbd>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SettingsWorkspace;
