import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Play,
  Pause,
  Trash2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTrafficStore, initTrafficTicker } from '../../stores/trafficStore';
import { TrafficMetricCards } from './TrafficMetricCards';
import { TrafficChart } from './TrafficChart';
import { KeyTrafficTable } from './KeyTrafficTable';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface TrafficWorkspaceProps {
  className?: string;
}

export const TrafficWorkspace: React.FC<TrafficWorkspaceProps> = ({ className = '' }) => {
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

  // Traffic store state & actions
  const isRecording = useTrafficStore((s) => s.isRecording);
  const toggleRecording = useTrafficStore((s) => s.toggleRecording);
  const clearTrafficHistory = useTrafficStore((s) => s.clearTrafficHistory);

  const [copiedZid, setCopiedZid] = useState<boolean>(false);

  // Initialize and tear down global traffic ticker interval
  useEffect(() => {
    const cleanup = initTrafficTicker();
    return cleanup;
  }, []);

  const handleCopyZid = () => {
    if (session?.zid) {
      navigator.clipboard.writeText(session.zid);
      setCopiedZid(true);
      setTimeout(() => setCopiedZid(false), 2000);
    }
  };

  return (
    <div className={`flex flex-col h-full w-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Workspace Top Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2 select-none shrink-0">
        {/* Left: Profile Title & Session ZID */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md bg-primary/10 text-primary shrink-0">
            <Activity className="w-4 h-4" />
          </div>

          <h2
            className="text-xs font-semibold text-foreground truncate max-w-[220px]"
            title={profile ? profile.name : 'Traffic Monitor'}
          >
            {profile ? profile.name : 'Traffic Monitor'}
          </h2>

          {profile && (
            <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0 shrink-0">
              {profile.mode}
            </Badge>
          )}

          {/* Connection Status Indicator */}
          {isConnected ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              <span
                className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:text-foreground transition-colors"
                title={session?.zid ? `Click to copy ZID: ${session.zid}` : 'Connected'}
                onClick={handleCopyZid}
              >
                {copiedZid ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3 h-3" />
                    Copied!
                  </span>
                ) : (
                  <span>ZID: {session?.zid ? `${session.zid.slice(0, 8)}…` : 'Connected'}</span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground">Disconnected</span>
            </div>
          )}
        </div>

        {/* Right: Recording Status & Controls */}
        <div className="flex items-center gap-2">
          {/* Recording Status Pill */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-mono">
            {isRecording ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Recording</span>
              </>
            ) : (
              <>
                <span className="inline-flex rounded-full h-2 w-2 bg-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 font-medium">Paused</span>
              </>
            )}
          </div>

          {/* Pause / Resume Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleRecording}
            className="h-7 px-2.5 text-xs gap-1.5"
            title={isRecording ? 'Pause telemetry recording' : 'Resume telemetry recording'}
          >
            {isRecording ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-500" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-500" />
                <span>Resume</span>
              </>
            )}
          </Button>

          {/* Clear Traffic History Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearTrafficHistory}
            className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
            title="Reset telemetry timeline and per-key statistics"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </Button>
        </div>
      </header>

      {/* Disconnected Notice Banner */}
      {!isConnected && (
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Session is offline. Connect to Zenoh network to capture live telemetry and throughput streams.
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

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Metric Cards Summary */}
        <TrafficMetricCards />

        {/* Rolling 60s SVG Chart */}
        <TrafficChart />

        {/* Per-Key Breakdown Table */}
        <KeyTrafficTable />
      </div>
    </div>
  );
};

export default TrafficWorkspace;
