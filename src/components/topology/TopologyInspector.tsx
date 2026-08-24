import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Power,
  Plus,
  Radio,
  ShieldCheck,
  Server,
  Users,
  Laptop,
  Settings,
  Network,
  Clock,
  Activity,
  ArrowRight,
  Zap,
  FileCode,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useConnectionStore } from '../../stores/connectionStore';
import { useConnectionJsonStore } from '../../stores/connectionJsonStore';
import { extractLocatorProtocol, extractLocatorHostPort, findMatchingProfile } from '../../lib/topology/topologyBuilder';
import type { TopologyNode } from '../../types/topology';
import type { ConnectionProfile } from '../../types/zenoh';

export interface TopologyInspectorProps {
  node: TopologyNode | null;
  onClose: () => void;
  onOpenProfileEditor: (node: TopologyNode) => void;
  onNavigateToPubSub?: () => void;
}

export const TopologyInspector: React.FC<TopologyInspectorProps> = ({
  node,
  onClose,
  onOpenProfileEditor,
  onNavigateToPubSub,
}) => {
  const [copiedLocator, setCopiedLocator] = useState<string | null>(null);
  const [copiedZid, setCopiedZid] = useState(false);
  const [copiedJson5, setCopiedJson5] = useState(false);
  const [showJson5, setShowJson5] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const connect = useConnectionStore((s) => s.connect);
  const saveProfile = useConnectionStore((s) => s.saveProfile);
  const profiles = useConnectionStore((s) => s.profiles);
  const activeSessions = useConnectionStore((s) => s.activeSessions);

  const syncNodeJson = useConnectionJsonStore((s) => s.syncNodeJson);
  const activeNodeJson = useConnectionJsonStore((s) => s.activeNodeJson);

  const existingProfile = node ? findMatchingProfile(profiles, node) : null;

  React.useEffect(() => {
    if (node) {
      const activeSession = existingProfile ? activeSessions[existingProfile.id] : null;
      syncNodeJson(node, existingProfile, activeSession);
    }
  }, [node, existingProfile, activeSessions, syncNodeJson]);

  if (!node) return null;

  const handleCopyZid = () => {
    navigator.clipboard.writeText(node.zid);
    setCopiedZid(true);
    setTimeout(() => setCopiedZid(false), 2000);
  };

  const handleCopyLocator = (loc: string) => {
    navigator.clipboard.writeText(loc);
    setCopiedLocator(loc);
    setTimeout(() => setCopiedLocator(null), 2000);
  };

  const handleConnectDirectly = async () => {
    setActionLoading(true);
    try {
      if (existingProfile) {
        await connect(existingProfile.id);
        return;
      }

      const primaryLocator = node.locators[0] || '';
      const now = Date.now();
      const newProfile: ConnectionProfile = {
        id: `profile-${now}`,
        name: node.label,
        mode: (node.type === 'router' ? 'client' : 'peer') as 'client' | 'peer',
        connect_locators: primaryLocator ? [primaryLocator] : [],
        listen_locators: [],
        scout_multicast: true,
        user_auth: null,
        tls_config: node.isTls ? {} : null,
        custom_config: null,
        created_at: now,
        updated_at: now,
      };
      await saveProfile(newProfile);
      await connect(newProfile.id);
    } catch (err) {
      console.error('Failed to connect from topology graph:', err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <aside className="w-80 border-l bg-card flex flex-col h-full shrink-0 shadow-lg z-20 animate-in slide-in-from-right-4 duration-200">
      {/* Inspector Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-muted text-muted-foreground">
            {node.type === 'router' ? (
              <Server className="w-4 h-4 text-indigo-500" />
            ) : node.type === 'peer' ? (
              <Users className="w-4 h-4 text-blue-500" />
            ) : (
              <Laptop className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold truncate">{node.label}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {node.type} node
              </span>
              {existingProfile && (
                <Badge variant="outline" className="text-[9px] h-3.5 bg-primary/10 text-primary border-primary/20 px-1 py-0 font-normal">
                  Saved
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {/* Node ZID */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Zenoh ID (ZID)</label>
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/60 border font-mono text-[11px]">
            <span className="truncate">{node.zid}</span>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={handleCopyZid}
              className="h-5 w-5 ml-1 shrink-0"
              title="Copy ZID"
            >
              {copiedZid ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        {/* Connection Type & Mode */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Connection Role & Mode</label>
          <div className="p-2.5 rounded-md bg-muted/40 border space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">Node Role</span>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-mono px-1.5 py-0 ${
                  node.type === 'router'
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                    : node.type === 'peer'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}
              >
                {node.type}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">Zenoh Mode</span>
              <span className="font-semibold text-foreground capitalize">
                {node.mode || (node.type === 'router' ? 'router' : node.type === 'client' ? 'client' : 'peer')}
              </span>
            </div>
            {existingProfile && (
              <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px]">
                <span className="text-muted-foreground">Profile</span>
                <span className="font-medium text-foreground truncate max-w-[140px]">{existingProfile.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Status and Encryption Badges */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Security & Status</label>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={node.status === 'connected' ? 'default' : 'secondary'}
              className="text-[10px] capitalize"
            >
              {node.status}
            </Badge>

            {node.isTls && (
              <Badge
                variant="secondary"
                className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              >
                <ShieldCheck className="w-3 h-3" />
                TLS Encrypted
              </Badge>
            )}
          </div>
        </div>

        {/* Advertised Locators List */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">
            Advertised Locators ({node.locators.length})
          </label>
          {node.locators.length === 0 ? (
            <div className="p-2.5 rounded-md bg-muted/40 border space-y-1 text-[11px] text-muted-foreground">
              <p className="font-medium text-foreground">Dynamic LAN Discovery</p>
              <p className="text-[10px] leading-relaxed">
                This node is operating via automatic UDP multicast scouting (<code className="font-mono text-[10px]">224.0.0.224:7446</code>) with ephemeral OS-assigned ports.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {node.locators.map((loc, idx) => {
                const proto = extractLocatorProtocol(loc, node.isTls);
                const host = extractLocatorHostPort(loc);
                const isCopied = copiedLocator === loc;

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-1.5 rounded-md bg-muted/40 border text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase font-mono">
                        {proto}
                      </Badge>
                      <span className="font-mono truncate">{host}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => handleCopyLocator(loc)}
                      className="h-5 w-5 shrink-0"
                      title="Copy Locator"
                    >
                      {isCopied ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Configured Upstreams (Connect Endpoints) */}
        {((node.connectLocators && node.connectLocators.length > 0) ||
          (existingProfile?.connect_locators && existingProfile.connect_locators.length > 0)) && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              Configured Upstreams (
                {(
                  (node.connectLocators && node.connectLocators.length > 0
                    ? node.connectLocators
                    : existingProfile?.connect_locators) || []
                ).length}
              )
            </label>
            <div className="space-y-1">
              {(
                (node.connectLocators && node.connectLocators.length > 0
                  ? node.connectLocators
                  : existingProfile?.connect_locators) || []
              ).map((loc, idx) => {
                const proto = extractLocatorProtocol(loc, node.isTls);
                const host = extractLocatorHostPort(loc);
                const isCopied = copiedLocator === loc;

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-1.5 rounded-md bg-muted/40 border text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase font-mono">
                        {proto}
                      </Badge>
                      <span className="font-mono truncate">{host}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => handleCopyLocator(loc)}
                      className="h-5 w-5 shrink-0"
                      title="Copy Locator"
                    >
                      {isCopied ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Verified Neighbors (Exact Engine Connections) */}
        {node.status === 'connected' && (
          <div className="space-y-1.5 pt-1 border-t border-border/50">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Network className="w-3 h-3 text-primary" />
                Live Verified Neighbors
              </label>
              <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                Exact Links
              </Badge>
            </div>

            <div className="space-y-2">
              {/* Connected Routers */}
              <div className="p-2 rounded-md bg-muted/40 border space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
                  <span className="flex items-center gap-1">
                    <Server className="w-3 h-3 text-indigo-500" />
                    Connected Routers ({node.connectedRouters?.length || 0})
                  </span>
                </div>
                {node.connectedRouters && node.connectedRouters.length > 0 ? (
                  <div className="space-y-1">
                    {node.connectedRouters.map((rZid, idx) => (
                      <div key={idx} className="flex items-center justify-between p-1 rounded bg-background/60 border text-[10px] font-mono">
                        <span className="truncate" title={rZid}>{rZid}</span>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                          Direct
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">No direct router sessions</p>
                )}
              </div>

              {/* Connected Peers */}
              <div className="p-2 rounded-md bg-muted/40 border space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-blue-500" />
                    Connected Peers ({node.connectedPeers?.length || 0})
                  </span>
                </div>
                {node.connectedPeers && node.connectedPeers.length > 0 ? (
                  <div className="space-y-1">
                    {node.connectedPeers.map((pZid, idx) => (
                      <div key={idx} className="flex items-center justify-between p-1 rounded bg-background/60 border text-[10px] font-mono">
                        <span className="truncate" title={pZid}>{pZid}</span>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-blue-500/10 text-blue-500 border-blue-500/20">
                          Direct
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">No direct peer sessions</p>
                )}
              </div>

              {/* Live Physical Links & Deep Telemetry */}
              {node.links && node.links.length > 0 && (
                <div className="p-2 rounded-md bg-muted/40 border space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      Physical Links & Telemetry ({node.links.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {node.links.map((link, idx) => (
                      <div key={idx} className="p-2 rounded bg-background/80 border space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase font-mono bg-primary/10 text-primary">
                            {link.whatami}
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[140px]" title={link.zid}>
                            {link.zid}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-muted/30 p-1 rounded">
                          <span className="truncate" title={link.src}>{extractLocatorHostPort(link.src) || link.src}</span>
                          <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                          <span className="truncate font-semibold text-foreground" title={link.dst}>{extractLocatorHostPort(link.dst) || link.dst}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          <Badge variant="secondary" className="text-[8px] px-1 py-0">
                            {link.is_streamed ? 'Streamed' : 'Datagram'}
                          </Badge>
                          {link.mtu !== undefined && link.mtu !== null && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 font-mono">
                              MTU {link.mtu}B
                            </Badge>
                          )}
                          {link.interfaces && link.interfaces.length > 0 && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 font-mono text-blue-500 bg-blue-500/10">
                              {link.interfaces.join(', ')}
                            </Badge>
                          )}
                          {link.reliability && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 capitalize">
                              {link.reliability}
                            </Badge>
                          )}
                          {link.priorities && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 font-mono">
                              Pri: {link.priorities}
                            </Badge>
                          )}
                          {link.auth_identifier && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 text-emerald-500 bg-emerald-500/10">
                              Auth: {link.auth_identifier}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Session Metrics */}
        {node.status === 'connected' && (node.uptimeSeconds !== undefined || node.activeSubscribers !== undefined) && (
          <div className="space-y-1.5 pt-1 border-t border-border/50">
            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="w-3 h-3 text-primary" />
              Session Metrics
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="p-2 rounded-md bg-muted/40 border text-[11px]">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  Uptime
                </div>
                <div className="font-semibold text-foreground mt-0.5 font-mono">
                  {node.uptimeSeconds !== undefined ? (
                    node.uptimeSeconds < 60 ? `${node.uptimeSeconds}s` :
                    node.uptimeSeconds < 3600 ? `${Math.floor(node.uptimeSeconds / 60)}m ${node.uptimeSeconds % 60}s` :
                    `${Math.floor(node.uptimeSeconds / 3600)}h ${Math.floor((node.uptimeSeconds % 3600) / 60)}m`
                  ) : '0s'}
                </div>
              </div>
              <div className="p-2 rounded-md bg-muted/40 border text-[11px]">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Radio className="w-3 h-3 text-muted-foreground" />
                  Subscribers
                </div>
                <div className="font-semibold text-foreground mt-0.5 font-mono">
                  {node.activeSubscribers ?? 0}
                </div>
              </div>
              <div className="p-2 rounded-md bg-muted/40 border text-[11px] col-span-2">
                <div className="text-[10px] text-muted-foreground">
                  Active Queryables
                </div>
                <div className="font-semibold text-foreground mt-0.5 font-mono">
                  {node.activeQueryables ?? 0} declared
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Node Configuration & Synchronized JSON5 */}
        {(() => {
          const handleCopyJson5 = () => {
            if (!activeNodeJson) return;
            navigator.clipboard.writeText(activeNodeJson);
            setCopiedJson5(true);
            setTimeout(() => setCopiedJson5(false), 2000);
          };

          return (
            <div className="space-y-1.5 pt-1 border-t border-border/50">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowJson5(!showJson5)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <FileCode className="w-3 h-3 text-indigo-500" />
                  <span>Node Configuration (JSON5)</span>
                  {showJson5 ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={handleCopyJson5}
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  title="Copy Node JSON5 Configuration"
                >
                  {copiedJson5 ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>

              {showJson5 && (
                <div className="relative rounded-md bg-muted/70 border p-2 font-mono text-[10px] text-foreground overflow-x-auto max-h-48 whitespace-pre animate-in fade-in duration-150">
                  {activeNodeJson || '{\n  // Loading node configuration...\n}'}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Action Buttons Footer */}
      <div className="p-3 border-t bg-muted/20 space-y-2">
        {node.type === 'router' && (
          <Button
            size="sm"
            onClick={handleConnectDirectly}
            disabled={actionLoading || node.status === 'connected'}
            className="w-full h-8 text-xs gap-1.5 font-medium"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{node.status === 'connected' ? 'Connected' : 'Connect to Router'}</span>
          </Button>
        )}

        {node.type === 'peer' && (
          <div className="p-2 rounded-md bg-muted/60 border text-[11px] text-muted-foreground flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Discovered LAN Peer. Meshed in peer-to-peer mode.</span>
          </div>
        )}

        {node.type === 'client' && (
          <div className="p-2 rounded-md bg-muted/60 border text-[11px] text-muted-foreground flex items-center gap-2">
            <Laptop className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              {node.status === 'connected'
                ? 'Active Client Session connected to Zenoh network.'
                : 'Configured Client Profile.'}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenProfileEditor(node)}
            className="flex-1 h-7 text-xs gap-1"
            title={existingProfile ? 'Edit existing connection profile' : 'Save discovered locator into connection profiles'}
          >
            {existingProfile ? (
              <>
                <Settings className="w-3 h-3 text-primary" />
                <span>Edit Profile</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                <span>Save Profile</span>
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToPubSub}
            className="flex-1 h-7 text-xs gap-1"
          >
            <Radio className="w-3 h-3" />
            <span>Pub/Sub</span>
          </Button>
        </div>
      </div>
    </aside>
  );
};
