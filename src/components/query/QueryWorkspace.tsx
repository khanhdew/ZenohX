import React, { useState, useEffect, useMemo } from 'react';
import {
  Server,
  Columns2,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useQueryStore } from '../../stores/queryStore';
import { QuerierPanel } from './QuerierPanel';
import { ReplyTimeline } from './ReplyTimeline';
import { QueryablePanel } from './QueryablePanel';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ResizeHandle } from '../ui/resize-handle';
import { useResizable } from '../../hooks/useResizable';

interface QueryWorkspaceProps {
  className?: string;
}

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<'querier' | 'queryable' | 'split'>('querier');

  // Resizable Querier Form Panel (Left)
  const {
    size: querierWidth,
    isDragging: isQuerierDragging,
    startDragging: startQuerierDragging,
    resetToDefault: resetQuerierWidth,
  } = useResizable({
    initialSize: 460,
    minSize: 320,
    maxSize: 750,
    storageKey: 'zenohx_query_querier_width',
  });

  // Resizable Split Stage Left Column
  const {
    size: splitLeftWidth,
    isDragging: isSplitDragging,
    startDragging: startSplitDragging,
    resetToDefault: resetSplitWidth,
  } = useResizable({
    initialSize: 550,
    minSize: 350,
    maxSize: 900,
    storageKey: 'zenohx_query_split_width',
  });

  // Connection store state
  const selectedProfileId = useConnectionStore((s) => s.selectedProfileId);
  const profiles = useConnectionStore((s) => s.profiles);
  const activeSessions = useConnectionStore((s) => s.activeSessions);
  const connect = useConnectionStore((s) => s.connect);

  // Active session and profile details
  const profile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  );
  const session = selectedProfileId ? activeSessions[selectedProfileId] : null;
  const isConnected = Boolean(session);
  const sessionId = session?.id;

  // Query store state
  const inboundQueries = useQueryStore((s) => s.inboundQueries);
  const initListener = useQueryStore((s) => s.initListener);
  const loadQueryHistory = useQueryStore((s) => s.loadQueryHistory);
  const loadQueryables = useQueryStore((s) => s.loadQueryables);

  useEffect(() => {
    initListener();
  }, [initListener]);

  // Auto load query history and queryable presets from SQLite
  useEffect(() => {
    if (selectedProfileId) {
      loadQueryHistory(selectedProfileId);
      loadQueryables(selectedProfileId, sessionId);
    }
  }, [selectedProfileId, sessionId, loadQueryHistory, loadQueryables]);

  const sessionInboundCount = sessionId
    ? inboundQueries.filter((q) => !q.session_id || q.session_id === sessionId).length
    : inboundQueries.length;

  return (
    <div className={`flex flex-col h-full w-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Workspace Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2 select-none shrink-0">
        {/* Left: Profile Title & Session ZID */}
        <div className="flex items-center gap-2 min-w-0">
          <h2
            className="text-xs font-semibold text-foreground truncate max-w-[220px]"
            title={profile ? profile.name : 'Query / RPC Workspace'}
          >
            {profile ? profile.name : 'Query / RPC Workspace'}
          </h2>

          {profile && (
            <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0 shrink-0">
              {profile.mode}
            </Badge>
          )}

          {/* Connection Status Indicator */}
          {isConnected ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                ZID: {session?.zid ? `${session.zid.slice(0, 8)}…` : 'Connected'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/40"></span>
              <span className="text-[11px] text-muted-foreground">Disconnected</span>
            </div>
          )}
        </div>

        {/* Center: Tab Navigation Switcher */}
        <div className="flex items-center rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('querier')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'querier'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Querier & Replies</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queryable')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'queryable'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Queryable Simulator</span>
            {sessionInboundCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-1.5 py-0 text-[10px] font-mono font-medium">
                {sessionInboundCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('split')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'split'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Split view: Client + Server mock on one screen"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split Stage</span>
          </button>
        </div>
      </header>

      {/* Disconnected Notice Banner */}
      {!isConnected && (
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Session is offline. Connect to execute distributed queries or respond to incoming RPC requests.
            </span>
          </div>
          {profile && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => connect(profile.id)}
              className="h-6 px-2 text-xs"
            >
              Connect
            </Button>
          )}
        </div>
      )}

      {/* Workspace Body */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {activeTab === 'querier' && (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 w-full overflow-hidden">
            {/* Querier Client Form on Left/Top */}
            <div
              style={{ width: `${querierWidth}px` }}
              className="w-full md:w-auto shrink-0 border-r border-border h-full overflow-y-auto"
            >
              <QuerierPanel
                sessionId={sessionId}
                profileId={profile?.id}
                className="h-full"
              />
            </div>

            <ResizeHandle
              isDragging={isQuerierDragging}
              onMouseDown={startQuerierDragging}
              onReset={resetQuerierWidth}
            />

            {/* Replies Timeline on Right/Bottom */}
            <div className="flex-1 h-full min-w-0 overflow-hidden">
              <ReplyTimeline
                sessionId={sessionId}
                className="h-full"
              />
            </div>
          </div>
        )}

        {activeTab === 'queryable' && (
          <div className="flex-1 h-full min-w-0 overflow-y-auto">
            <QueryablePanel
              sessionId={sessionId}
              profileId={profile?.id}
              className="h-full"
            />
          </div>
        )}

        {activeTab === 'split' && (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 w-full overflow-hidden">
            {/* Left: Querier & Reply Feed */}
            <div
              style={{ width: `${splitLeftWidth}px` }}
              className="w-full lg:w-auto shrink-0 flex flex-col min-h-0 h-full overflow-hidden border-r border-border"
            >
              <div className="p-2 border-b bg-muted/30 flex items-center justify-between text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  Client Querier
                </span>
                <Badge variant="outline" className="text-[10px]">
                  session.get
                </Badge>
              </div>
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="h-1/2 border-b border-border overflow-y-auto">
                  <QuerierPanel
                    sessionId={sessionId}
                    profileId={profile?.id}
                    className="h-full"
                  />
                </div>
                <div className="h-1/2 overflow-hidden">
                  <ReplyTimeline
                    sessionId={sessionId}
                    className="h-full"
                  />
                </div>
              </div>
            </div>

            <ResizeHandle
              isDragging={isSplitDragging}
              onMouseDown={startSplitDragging}
              onReset={resetSplitWidth}
            />

            {/* Right: Queryable Simulator Server */}
            <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
              <div className="p-2 border-b bg-muted/30 flex items-center justify-between text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-muted-foreground" />
                  Queryable Server Simulator
                </span>
                <Badge variant="outline" className="text-[10px]">
                  session.declare_queryable
                </Badge>
              </div>
              <div className="flex-1 overflow-y-auto">
                <QueryablePanel
                  sessionId={sessionId}
                  profileId={profile?.id}
                  className="h-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueryWorkspace;
