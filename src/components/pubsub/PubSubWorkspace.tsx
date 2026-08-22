import React, { useState, useMemo } from 'react';
import {
  Radio,
  Layers,
  Info,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  AlertCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useMessageStore } from '../../stores/messageStore';
import { SubscriptionList } from './SubscriptionList';
import { MessageList } from './MessageList';
import { PublishBar } from './PublishBar';
import { PayloadViewer } from '../viewer/PayloadViewer';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ResizeHandle } from '../ui/resize-handle';
import { useResizable } from '../../hooks/useResizable';
import { formatByteSize, formatTimeWithMs, matchesKeyExpr, normalizeEncoding } from '../../lib/formatters';

interface PubSubWorkspaceProps {
  className?: string;
}

export const PubSubWorkspace: React.FC<PubSubWorkspaceProps> = ({ className = '' }) => {
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

  // Message store state
  const selectedMessage = useMessageStore((s) => s.selectedMessage);
  const selectMessage = useMessageStore((s) => s.selectMessage);
  const subscriptions = useMessageStore((s) => s.subscriptions);

  // Panel layout toggles
  const [showSubscriptionPanel, setShowSubscriptionPanel] = useState<boolean>(true);
  const [inspectorExpanded, setInspectorExpanded] = useState<boolean>(false);

  // Resizable Subscriptions Left Panel
  const {
    size: subPanelWidth,
    isDragging: isSubDragging,
    startDragging: startSubDragging,
    resetToDefault: resetSubWidth,
  } = useResizable({
    initialSize: 280,
    minSize: 200,
    maxSize: 450,
    storageKey: 'zenohx_pubsub_sub_width',
  });

  // Resizable Inspector Right Panel
  const {
    size: inspectorWidth,
    isDragging: isInspectorDragging,
    startDragging: startInspectorDragging,
    resetToDefault: resetInspectorWidth,
  } = useResizable({
    initialSize: 380,
    minSize: 280,
    maxSize: 700,
    reverse: true,
    storageKey: 'zenohx_pubsub_inspector_width',
  });

  // Stats for the workspace
  const sessionSubs = useMemo(() => {
    if (!sessionId) return subscriptions;
    return subscriptions.filter((s) => !s.sessionId || s.sessionId === sessionId);
  }, [subscriptions, sessionId]);

  return (
    <div className={`flex flex-col h-full w-full bg-background text-foreground overflow-hidden ${className}`}>
      {/* Workspace Top Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2 select-none shrink-0">
        {/* Left: Profile name, Mode badge, Session ZID */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-foreground">
              {profile ? profile.name : 'Pub / Sub Workspace'}
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

        {/* Right: Subscriptions panel toggle */}
        <div className="flex items-center gap-2">
          {/* Subscriptions Panel Toggle Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSubscriptionPanel(!showSubscriptionPanel)}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title={
              showSubscriptionPanel
                ? 'Hide Topics panel'
                : 'Show Topics panel'
            }
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Topics ({sessionSubs.length})</span>
          </Button>
        </div>
      </header>

      {/* Disconnected Notice Banner if selected profile is not connected */}
      {!isConnected && (
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Session is offline. Connect to Zenoh network to receive real-time streams and publish samples.
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

      {/* Main Workspace Stage Body (Split View) */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left: Subscriptions Side Panel */}
        {showSubscriptionPanel && (
          <>
            <div
              style={{ width: `${subPanelWidth}px` }}
              className="shrink-0 h-full border-r border-border overflow-hidden"
            >
              <SubscriptionList
                sessionId={sessionId}
                profileId={profile?.id}
                className="h-full"
              />
            </div>
            <ResizeHandle
              isDragging={isSubDragging}
              onMouseDown={startSubDragging}
              onReset={resetSubWidth}
            />
          </>
        )}

        {/* Center & Right: Message Stream Feed + Inspector Panel */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Upper split: Messages list + Details Inspector */}
          <div className="flex-1 flex min-h-0 relative overflow-hidden">
            {/* Center: Message Feed */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
              <MessageList
                sessionId={sessionId}
                profileId={profile?.id}
                onSelectMessage={(msg) => selectMessage(msg)}
                className="h-full"
              />
            </div>

            {/* Right: Message Inspector Panel (when a message is selected) */}
            {selectedMessage && (
              <>
                <ResizeHandle
                  isDragging={isInspectorDragging}
                  onMouseDown={startInspectorDragging}
                  onReset={resetInspectorWidth}
                />
                <div
                  style={{ width: `${inspectorExpanded ? Math.max(580, inspectorWidth) : inspectorWidth}px` }}
                  className="border-l border-border bg-card flex flex-col shrink-0 h-full overflow-hidden"
                >
                {/* Inspector Header */}
                <div className="flex items-center justify-between p-2.5 border-b bg-muted/20">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-xs text-foreground truncate">
                      Message Details
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Expand/Contract Inspector Width */}
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

                    {/* Close Inspector */}
                    <button
                      type="button"
                      onClick={() => selectMessage(null)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Close inspector"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inspector Message Metadata Overview */}
                <div className="p-3 border-b bg-muted/10 space-y-2 text-xs">
                  {/* Key Expression */}
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                      Key Expression
                    </div>
                    <div className="font-mono text-xs font-medium text-foreground break-all bg-muted/40 p-1.5 rounded border">
                      {selectedMessage.keyExpr}
                    </div>
                  </div>

                  {/* Matched Subscription Tag */}
                  {(() => {
                    const matchedSub = subscriptions.find((s) =>
                      matchesKeyExpr(s.keyExpr, selectedMessage.keyExpr)
                    );
                    if (!matchedSub) return null;
                    const subColor = matchedSub.colorTag || '#3b82f6';
                    return (
                      <div className="pt-0.5">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                          Matched Subscription Topic
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-xs p-1.5 rounded bg-muted/40 border">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: subColor }}
                          />
                          <span className="font-semibold text-foreground">{matchedSub.keyExpr}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto uppercase font-mono">
                            {matchedSub.encoding || 'raw'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Meta pills grid: Direction, Kind, Timestamp, Size, Encoding */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                        Direction
                      </div>
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono font-semibold uppercase px-1.5 py-0 border ${
                            selectedMessage.direction === 'incoming'
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                          }`}
                        >
                          {selectedMessage.direction === 'incoming' ? (
                            <ArrowDownLeft className="w-3 h-3 mr-0.5 inline-block text-sky-500" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3 mr-0.5 inline-block text-purple-500" />
                          )}
                          {selectedMessage.direction === 'incoming' ? 'IN' : 'OUT'}
                        </Badge>
                        {selectedMessage.kind === 'delete' && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0 uppercase font-mono">
                            DELETE
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                        Timestamp
                      </div>
                      <div className="font-mono text-[11px] text-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {formatTimeWithMs(selectedMessage.timestamp)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                        Payload Size
                      </div>
                      <div className="font-mono text-xs font-medium text-foreground">
                        {formatByteSize(selectedMessage.payload?.length || 0)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-0.5">
                        Encoding
                      </div>
                      <div className="font-mono text-xs uppercase font-medium text-foreground">
                        {normalizeEncoding(selectedMessage.encoding, selectedMessage.payload)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inspector Payload Viewer Area */}
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">
                    Payload Content
                  </div>
                  <PayloadViewer
                    payload={selectedMessage.payload}
                    encoding={normalizeEncoding(selectedMessage.encoding, selectedMessage.payload)}
                    showMetrics={true}
                    maxHeight="460px"
                  />
                </div>
              </div>
            </>
            )}
          </div>

          {/* Bottom Publisher Toolbar */}
          <PublishBar
            sessionId={sessionId}
            profileId={profile?.id}
            className="shrink-0"
          />
        </div>
      </div>
    </div>
  );
};

export default PubSubWorkspace;
