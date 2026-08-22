import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Server,
  Columns2,
  Activity,
  Power,
  PowerOff,
  AlertCircle,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useQueryStore } from '../../stores/queryStore';
import { QuerierPanel } from './QuerierPanel';
import { ReplyTimeline } from './ReplyTimeline';
import { QueryablePanel } from './QueryablePanel';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface QueryWorkspaceProps {
  className?: string;
}

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<'querier' | 'queryable' | 'split'>('querier');

  // Connection store state
  const selectedProfileId = useConnectionStore((s) => s.selectedProfileId);
  const profiles = useConnectionStore((s) => s.profiles);
  const activeSessions = useConnectionStore((s) => s.activeSessions);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);

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
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2 select-none shrink-0">
        {/* Left: Profile Title & Session ZID */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-foreground">
              {profile ? profile.name : 'Query / RPC Workspace'}
            </h2>
          </div>

          {profile && (
            <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
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

        {/* Right: Connect / Disconnect Action */}
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
              className="h-7 px-2.5 text-xs gap-1 font-medium"
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
            <div className="w-full md:w-[480px] shrink-0 border-r border-border h-full overflow-y-auto">
              <QuerierPanel
                sessionId={sessionId}
                profileId={profile?.id}
                className="h-full"
              />
            </div>

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
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 w-full overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-border">
            {/* Left: Querier & Reply Feed */}
            <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
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
