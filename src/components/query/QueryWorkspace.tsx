import React, { useState, useEffect } from 'react';
import {
  Search,
  Server,
  Activity,
  Power,
  PowerOff,
  AlertCircle,
  Columns2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { QuerierPanel } from './QuerierPanel';
import { ReplyTimeline } from './ReplyTimeline';
import { QueryablePanel } from './QueryablePanel';
import { useConnectionStore } from '../../stores/connectionStore';
import { useQueryStore } from '../../stores/queryStore';

export interface QueryWorkspaceProps {
  className?: string;
}

export type WorkspaceTab = 'querier' | 'queryable' | 'split';

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({ className = '' }) => {
  const {
    selectedProfileId,
    activeSessions,
    getSelectedProfile,
    connect,
    disconnect,
  } = useConnectionStore();

  const {
    initListener,
    inboundQueries,
  } = useQueryStore();

  const profile = getSelectedProfile();
  const session = selectedProfileId ? activeSessions[selectedProfileId] : undefined;
  const isConnected = Boolean(session);
  const sessionId = session?.id;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('querier');

  // Initialize inbound query listener on component mount
  useEffect(() => {
    initListener();
    return () => {
      // Keep listener active for store lifecycle
    };
  }, [initListener]);

  const sessionInboundCount = sessionId
    ? inboundQueries.filter((q) => !q.session_id || q.session_id === sessionId).length
    : inboundQueries.length;

  return (
    <div className={`flex flex-col h-full w-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Top Workspace Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2.5 select-none shrink-0 shadow-xs">
        {/* Left: Profile Title & Session ZID */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Search className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold tracking-tight text-foreground">
              {profile ? profile.name : 'Query / RPC Workspace'}
            </h2>
          </div>

          {profile && (
            <Badge
              variant={
                profile.mode === 'router'
                  ? 'purple'
                  : profile.mode === 'client'
                  ? 'success'
                  : 'info'
              }
              className="text-[10px] uppercase font-mono px-1.5 py-0"
            >
              {profile.mode}
            </Badge>
          )}

          {/* Connection Status Indicator */}
          {isConnected ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
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
        <div className="flex items-center rounded-lg bg-muted/70 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('querier')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'querier'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span>Querier & Replies</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queryable')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'queryable'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-purple-500" />
            <span>Queryable Simulator</span>
            {sessionInboundCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-purple-500 text-white px-1.5 py-0 text-[10px] font-bold">
                {sessionInboundCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('split')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'split'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Split view: Client + Server mock on one screen"
          >
            <Columns2 className="w-3.5 h-3.5 text-amber-500" />
            <span>Split Stage</span>
          </button>
        </div>

        {/* Right: Quick Connect / Disconnect */}
        <div className="flex items-center gap-2">
          {profile && (
            <Button
              type="button"
              variant={isConnected ? 'destructive' : 'default'}
              size="sm"
              onClick={async () => {
                if (isConnected) {
                  await disconnect(profile.id);
                } else {
                  await connect(profile.id);
                }
              }}
              className="h-7 px-2.5 text-xs gap-1 shadow-xs font-semibold"
            >
              {isConnected ? (
                <>
                  <PowerOff className="w-3 h-3" />
                  Disconnect
                </>
              ) : (
                <>
                  <Power className="w-3 h-3" />
                  Connect
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Disconnected Warning Banner */}
      {!isConnected && (
        <div className="flex items-center justify-between border-b bg-amber-500/10 border-amber-500/20 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              Session is currently disconnected. Connect to Zenoh network to issue distributed get queries and declare queryable endpoints.
            </span>
          </div>
          {profile && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => connect(profile.id)}
              className="h-6 px-2 text-xs border-amber-500/40 hover:bg-amber-500/20"
            >
              Connect Session
            </Button>
          )}
        </div>
      )}

      {/* Main Tab Stage Content */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        {/* Tab 1: Querier & Reply Timeline */}
        {activeTab === 'querier' && (
          <div className="h-full flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* Left: Querier Panel (fixed width on desktop) */}
            <div className="w-full md:w-[380px] lg:w-[420px] shrink-0 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-border overflow-hidden">
              <QuerierPanel
                sessionId={sessionId}
                profileId={profile?.id}
                className="h-full"
              />
            </div>

            {/* Right: Multi-reply Timeline Inspector */}
            <div className="flex-1 min-w-0 h-1/2 md:h-full overflow-hidden">
              <ReplyTimeline
                sessionId={sessionId}
                className="h-full"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Queryable Simulator & Inbound Queue */}
        {activeTab === 'queryable' && (
          <div className="h-full w-full overflow-hidden">
            <QueryablePanel
              sessionId={sessionId}
              profileId={profile?.id}
              className="h-full"
            />
          </div>
        )}

        {/* Tab 3: Split Stage (Querier + Queryable side-by-side) */}
        {activeTab === 'split' && (
          <div className="h-full grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border min-h-0 overflow-hidden">
            {/* Left half: Querier + Replies */}
            <div className="h-full flex flex-col min-h-0 overflow-hidden">
              <div className="h-2/5 border-b border-border min-h-0">
                <QuerierPanel
                  sessionId={sessionId}
                  profileId={profile?.id}
                  className="h-full"
                />
              </div>
              <div className="flex-1 min-h-0">
                <ReplyTimeline
                  sessionId={sessionId}
                  className="h-full"
                />
              </div>
            </div>

            {/* Right half: Queryable Server & Inbound */}
            <div className="h-full min-h-0 overflow-hidden">
              <QueryablePanel
                sessionId={sessionId}
                profileId={profile?.id}
                className="h-full"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default QueryWorkspace;
