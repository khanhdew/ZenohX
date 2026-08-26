// Copyright 2026 ZenohX Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Radio,
  ShieldCheck,
  Server,
  Share2,
  Laptop,
  Network,
  Clock,
  Activity,
  ArrowRight,
  Zap,
  FileCode,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useConnectionStore } from '../../stores/connectionStore';
import { useConnectionJsonStore } from '../../stores/connectionJsonStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { extractLocatorProtocol, extractLocatorHostPort, findMatchingProfile } from '../../lib/topology/topologyBuilder';
import type { TopologyNode } from '../../types/topology';

export interface TopologyInspectorProps {
  node: TopologyNode | null;
  onClose: () => void;
  onOpenProfileEditor?: (node: TopologyNode) => void;
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [customNameInput, setCustomNameInput] = useState('');

  const setNodeName = useTopologyStore((s) => s.setNodeName);
  const customNodeLabels = useTopologyStore((s) => s.customNodeLabels);
  const storeNodes = useTopologyStore((s) => s.nodes);
  const profiles = useConnectionStore((s) => s.profiles);
  const activeSessions = useConnectionStore((s) => s.activeSessions);

  const syncNodeJson = useConnectionJsonStore((s) => s.syncNodeJson);
  const activeNodeJson = useConnectionJsonStore((s) => s.activeNodeJson);

  const existingProfile = node ? findMatchingProfile(profiles, node) : null;

  // Derive the up-to-date node & resolved name directly from store state
  const liveNode = (node && storeNodes.find((n) => n.id === node.id || n.zid === node.zid)) || node;
  const isLocalNode = liveNode ? liveNode.scope === 'local' : false;
  const resolvedName =
    (node?.zid && customNodeLabels[node.zid]) ||
    (node?.zid && customNodeLabels[node.zid.toLowerCase()]) ||
    (node?.id && customNodeLabels[node.id]) ||
    (liveNode?.label) ||
    (node?.label) ||
    '';

  // Sync Node JSON5 config when node changes
  React.useEffect(() => {
    if (liveNode) {
      const activeSession = existingProfile ? activeSessions[existingProfile.id] : null;
      syncNodeJson(liveNode, existingProfile, activeSession);
    }
  }, [liveNode, existingProfile, activeSessions, syncNodeJson]);

  // Reset editing mode when switching to a different node
  React.useEffect(() => {
    setIsEditingName(false);
  }, [node?.id, node?.zid]);

  if (!node || !liveNode) return null;

  const handleStartEditing = () => {
    setCustomNameInput(resolvedName);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    const trimmed = customNameInput.trim();
    if (trimmed) {
      setNodeName(node.zid || node.id, trimmed);
    }
    setIsEditingName(false);
  };

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

  return (
    <aside className="w-80 border-l bg-card flex flex-col h-full shrink-0 shadow-lg z-20 animate-in slide-in-from-right-4 duration-200">

      {/* Inspector Header */}
      <div className="p-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 rounded-md bg-muted text-muted-foreground shrink-0">
            {liveNode.type === 'router' ? (
              <Server className="w-4 h-4 text-indigo-500" />
            ) : liveNode.type === 'peer' ? (
              <Share2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Laptop className="w-4 h-4 text-sky-500" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  autoFocus
                  placeholder="Node name..."
                  className="h-6 w-full px-1.5 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={handleSaveName}
                  className="h-6 w-6 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 shrink-0"
                  title="Save Name"
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => setIsEditingName(false)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group">
                <h3
                  className="text-xs font-semibold truncate cursor-pointer hover:underline"
                  title={isLocalNode ? 'Click to edit profile' : 'Click to rename'}
                  onClick={() => {
                    if (isLocalNode) {
                      onOpenProfileEditor?.(liveNode);
                    } else {
                      handleStartEditing();
                    }
                  }}
                >
                  {resolvedName}
                </h3>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => {
                    if (isLocalNode) {
                      onOpenProfileEditor?.(liveNode);
                    } else {
                      handleStartEditing();
                    }
                  }}
                  className="h-5 w-5 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground shrink-0"
                  title={isLocalNode ? 'Edit profile' : 'Rename node'}
                >
                  {isLocalNode ? <FileCode className="w-2.5 h-2.5" /> : <Edit2 className="w-2.5 h-2.5" />}
                </Button>
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {liveNode.type} node
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] h-3.5 px-1 py-0 font-medium ${
                  liveNode.scope === 'local'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                }`}
              >
                {liveNode.scope === 'local' ? 'Local App' : 'Remote'}
              </Badge>
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
          className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
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
          <label className="text-[11px] font-medium text-muted-foreground">Connection Role & Scope</label>
          <div className="p-2.5 rounded-md bg-muted/40 border space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">Node Scope</span>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-mono px-1.5 py-0 ${
                  liveNode.scope === 'local'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                }`}
              >
                {liveNode.scope === 'local' ? 'Local (App Node)' : 'Remote (Network)'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">Node Role</span>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-mono px-1.5 py-0 ${
                  node.type === 'router'
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                    : node.type === 'peer'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
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
        {(() => {
          const effectiveLocators =
            node.locators && node.locators.length > 0
              ? node.locators
              : node.type !== 'client' && existingProfile?.listen_locators && existingProfile.listen_locators.length > 0
              ? existingProfile.listen_locators
              : [];

          return (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                Advertised Locators ({effectiveLocators.length})
              </label>
              {effectiveLocators.length === 0 ? (
                <div className="p-2.5 rounded-md bg-muted/40 border space-y-1 text-[11px] text-muted-foreground">
                  {node.type === 'client' ? (
                    <>
                      <p className="font-medium text-foreground">Outbound Client Session</p>
                      <p className="text-[10px] leading-relaxed">
                        Client nodes connect outbound to upstream routers and do not bind or advertise listening endpoints.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-foreground">Dynamic LAN Discovery</p>
                      <p className="text-[10px] leading-relaxed">
                        This node is operating via automatic UDP multicast scouting (<code className="font-mono text-[10px]">224.0.0.224:7446</code>) with ephemeral OS-assigned ports.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {effectiveLocators.map((loc, idx) => {
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
          );
        })()}

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
                    <Share2 className="w-3 h-3 text-emerald-500" />
                    Connected Peers ({node.connectedPeers?.length || 0})
                  </span>
                </div>
                {node.connectedPeers && node.connectedPeers.length > 0 ? (
                  <div className="space-y-1">
                    {node.connectedPeers.map((pZid, idx) => (
                      <div key={idx} className="flex items-center justify-between p-1 rounded bg-background/60 border text-[10px] font-mono">
                        <span className="truncate" title={pZid}>{pZid}</span>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
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
          <div className="p-2 rounded-md bg-muted/60 border text-[11px] text-muted-foreground flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>
              {node.status === 'connected'
                ? 'Active Router tracked on network.'
                : 'Discovered Router on network (Tracked).'}
            </span>
          </div>
        )}

        {node.type === 'peer' && (
          <div className="p-2 rounded-md bg-muted/60 border text-[11px] text-muted-foreground flex items-center gap-2">
            <Share2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              {node.status === 'connected'
                ? 'Active Peer tracked in mesh.'
                : 'Discovered LAN Peer (Tracked).'}
            </span>
          </div>
        )}

        {node.type === 'client' && (
          <div className="p-2 rounded-md bg-muted/60 border text-[11px] text-muted-foreground flex items-center gap-2">
            <Laptop className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span>
              {node.status === 'connected'
                ? 'Active Client Session tracked on network.'
                : 'Configured Client Profile.'}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {isLocalNode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenProfileEditor?.(liveNode)}
              className="flex-1 h-7 text-xs gap-1"
              title="Edit profile for this local node"
            >
              <FileCode className="w-3 h-3 text-primary" />
              <span>Edit Profile</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartEditing}
              className="flex-1 h-7 text-xs gap-1"
              title="Edit custom name for this remote node"
            >
              <Edit2 className="w-3 h-3 text-primary" />
              <span>Edit Name</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToPubSub}
            className="flex-1 h-7 text-xs gap-1"
          >
            <Radio className="w-3 h-3" />
            <span>Pub/Sub</span>
          </Button>

          {node.status !== 'connected' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (existingProfile) {
                  useConnectionStore.getState().deleteProfile(existingProfile.id);
                } else {
                  useConnectionStore.getState().removeScoutedNode(node.zid);
                }
                onClose();
              }}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              title={existingProfile ? 'Delete Profile' : 'Remove node from topology'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
};
