import React, { useState, useEffect } from 'react';
import {
  Radar,
  RefreshCw,
  Server,
  Zap,
  Copy,
  Check,
  Plus,
  Play,
  Wifi,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionProfile, ScoutedNode } from '../../types/zenoh';

export interface ScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseAsProfile?: (node: ScoutedNode) => void;
  onOpenProfileEditor?: (profile: ConnectionProfile) => void;
}

export const ScoutModal: React.FC<ScoutModalProps> = ({
  isOpen,
  onClose,
  onUseAsProfile,
  onOpenProfileEditor,
}) => {
  const scoutedNodes = useConnectionStore((state) => state.scoutedNodes);
  const isScouting = useConnectionStore((state) => state.isScouting);
  const scout = useConnectionStore((state) => state.scout);
  const saveProfile = useConnectionStore((state) => state.saveProfile);
  const connectSession = useConnectionStore((state) => state.connect);

  const [timeoutMs, setTimeoutMs] = useState<number>(3000);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [actionLoadingZid, setActionLoadingZid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Trigger scout on initial open if not already scouting
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      handleScout();
    }
  }, [isOpen]);

  const handleScout = async () => {
    setErrorMsg(null);
    try {
      await scout(timeoutMs);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    });
  };

  // Build a ConnectionProfile from a scouted node
  const buildProfileFromNode = (node: ScoutedNode): ConnectionProfile => {
    const isRouter = node.what.toLowerCase() === 'router';
    const shortZid = node.zid ? node.zid.slice(0, 8) : 'unknown';
    const now = Date.now();

    return {
      id: crypto.randomUUID(),
      name: `Zenoh ${isRouter ? 'Router' : 'Peer'} (${shortZid})`,
      mode: isRouter ? 'client' : 'peer',
      connect_locators: node.locators && node.locators.length > 0 ? [...node.locators] : [],
      listen_locators: [],
      scout_multicast: true,
      user_auth: null,
      tls_config: null,
      custom_config: null,
      created_at: now,
      updated_at: now,
    };
  };

  const handleCreateProfile = async (node: ScoutedNode, openEditor: boolean = false) => {
    setActionLoadingZid(node.zid);
    try {
      const newProfile = buildProfileFromNode(node);
      await saveProfile(newProfile);

      if (onUseAsProfile) {
        onUseAsProfile(node);
      }

      if (openEditor && onOpenProfileEditor) {
        onOpenProfileEditor(newProfile);
      }

      setActionLoadingZid(null);
      onClose();
    } catch (err) {
      setActionLoadingZid(null);
      setErrorMsg(String(err));
    }
  };

  const handleConnectDirectly = async (node: ScoutedNode) => {
    setActionLoadingZid(node.zid);
    try {
      const newProfile = buildProfileFromNode(node);
      await saveProfile(newProfile);
      await connectSession(newProfile.id);

      setActionLoadingZid(null);
      onClose();
    } catch (err) {
      setActionLoadingZid(null);
      setErrorMsg(String(err));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-md bg-muted text-muted-foreground">
                <Radar className={`w-4 h-4 ${isScouting ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  LAN Multicast Scout
                  {isScouting && (
                    <Badge variant="secondary" className="text-[10px] animate-pulse">
                      Scanning...
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Listen for Zenoh peers and routers announcing on UDP multicast (<code className="font-mono text-[10px]">224.0.0.224:7447</code>).
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs uppercase font-mono">
              Scout
            </Badge>
          </div>
        </DialogHeader>

        {/* Toolbar & Filter Bar */}
        <div className="p-3 border-b bg-muted/10 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              Discovered Nodes: <span className="font-mono font-bold">{scoutedNodes.length}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Timeout:</span>
              <select
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                disabled={isScouting}
                className="h-7 text-xs rounded border border-input bg-background px-1.5 font-mono"
              >
                <option value={1500}>1.5s</option>
                <option value={3000}>3.0s</option>
                <option value={5000}>5.0s</option>
                <option value={10000}>10.0s</option>
              </select>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={handleScout}
              disabled={isScouting}
              className="h-7 text-xs gap-1.5 font-medium"
            >
              <RefreshCw className={`w-3 h-3 ${isScouting ? 'animate-spin' : ''}`} />
              <span>{isScouting ? 'Scouting...' : 'Scan Again'}</span>
            </Button>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* Scouted Nodes List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {scoutedNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 mt-4 border border-dashed rounded-md bg-muted/10">
              <div className="p-3 rounded-full bg-muted text-muted-foreground">
                <Wifi className={`w-6 h-6 ${isScouting ? 'animate-pulse' : 'opacity-40'}`} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold">
                  {isScouting ? 'Scanning local subnet for Zenoh nodes...' : 'No Zenoh Nodes Discovered'}
                </h4>
                <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
                  {isScouting
                    ? 'Listening for UDP multicast heartbeat packets on 224.0.0.224:7447.'
                    : 'No Zenoh peers or routers responded. Ensure target nodes have multicast scouting enabled or add locators manually.'}
                </p>
              </div>
              {!isScouting && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScout}
                  className="h-7 text-xs gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Scan
                </Button>
              )}
            </div>
          ) : (
            scoutedNodes.map((node, index) => {
              const isRouter = node.what.toLowerCase() === 'router';
              const isLoading = actionLoadingZid === node.zid;

              return (
                <div
                  key={`${node.zid}-${index}`}
                  className="rounded-md border bg-card p-3 space-y-2.5 transition-colors hover:border-foreground/30"
                >
                  {/* Node Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-muted text-muted-foreground">
                        {isRouter ? (
                          <Server className="w-4 h-4" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">
                            Zenoh {isRouter ? 'Router' : 'Peer'}
                          </span>
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {node.what}
                          </Badge>
                        </div>
                        {/* ZID */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">ZID:</span>
                          <code className="font-mono text-xs text-foreground select-all">
                            {node.zid}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(node.zid)}
                            className="text-muted-foreground hover:text-foreground p-0.5"
                            title="Copy ZID"
                          >
                            {copiedText === node.zid ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreateProfile(node, false)}
                        disabled={isLoading}
                        className="h-7 text-xs gap-1"
                        title="Save as a new connection profile"
                      >
                        <Plus className="w-3 h-3" />
                        + Profile
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleConnectDirectly(node)}
                        disabled={isLoading}
                        className="h-7 text-xs gap-1 font-medium"
                        title="Create profile and connect immediately"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Connect
                      </Button>
                    </div>
                  </div>

                  {/* Locators List */}
                  {node.locators && node.locators.length > 0 && (
                    <div className="space-y-1 pt-1 border-t">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Advertised Locators ({node.locators.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {node.locators.map((loc, lIdx) => (
                          <div
                            key={lIdx}
                            className="flex items-center gap-1 font-mono text-[11px] rounded bg-muted/60 px-2 py-0.5 border"
                          >
                            <span className="text-foreground">{loc}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(loc)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Copy locator"
                            >
                              {copiedText === loc ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 border-t bg-muted/20 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Scouting uses multicast UDP group 224.0.0.224 on port 7447.
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScoutModal;
