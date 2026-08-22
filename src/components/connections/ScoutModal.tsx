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
        <DialogHeader className="p-5 pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Radar className={`w-5 h-5 ${isScouting ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <DialogTitle className="text-lg flex items-center gap-2">
                  LAN Multicast Scout Explorer
                  {isScouting && (
                    <Badge variant="info" className="text-[10px] animate-pulse">
                      Scanning LAN...
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Discovers Zenoh routers and peers broadcasting on UDP multicast (224.0.0.224:7447).
                </DialogDescription>
              </div>
            </div>

            {/* Scan Controls */}
            <div className="flex items-center gap-2">
              <select
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                disabled={isScouting}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value={1000}>1s timeout</option>
                <option value={2000}>2s timeout</option>
                <option value={3000}>3s timeout</option>
                <option value={5000}>5s timeout</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleScout}
                disabled={isScouting}
                className="h-8 gap-1 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScouting ? 'animate-spin' : ''}`} />
                {isScouting ? 'Scanning...' : 'Scan'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 rounded-md bg-destructive/15 border border-destructive/30 flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isScouting && scoutedNodes.length === 0 ? (
            /* Scanning Animation State */
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary animate-pulse">
                <Radar className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Scouting local network for Zenoh nodes...</p>
                <p className="text-xs text-muted-foreground">
                  Listening for multicast responses ({timeoutMs / 1000}s scan)
                </p>
              </div>
            </div>
          ) : scoutedNodes.length === 0 ? (
            /* Empty State */
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3 rounded-lg border border-dashed p-6">
              <div className="p-3 rounded-full bg-muted text-muted-foreground">
                <Wifi className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-medium">No Zenoh nodes discovered</p>
                <p className="text-xs text-muted-foreground">
                  Make sure nearby Zenoh routers or peers have multicast scouting enabled on <code className="font-mono text-[11px]">224.0.0.224:7447</code>, or try extending the scan timeout.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleScout}
                disabled={isScouting}
                className="text-xs gap-1 mt-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </Button>
            </div>
          ) : (
            /* Discovered Nodes List */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Found {scoutedNodes.length} node{scoutedNodes.length === 1 ? '' : 's'} on network</span>
                {isScouting && <span className="text-primary animate-pulse">Still scanning...</span>}
              </div>

              {scoutedNodes.map((node, index) => {
                const isRouter = node.what.toLowerCase() === 'router';
                const isLoading = actionLoadingZid === node.zid;

                return (
                  <div
                    key={`${node.zid}-${index}`}
                    className="rounded-lg border bg-card p-4 space-y-3 hover:border-primary/40 transition-colors shadow-sm"
                  >
                    {/* Node Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-md ${
                            isRouter
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {isRouter ? (
                            <Server className="w-4 h-4" />
                          ) : (
                            <Zap className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">
                              Zenoh {isRouter ? 'Router' : 'Peer'}
                            </span>
                            <Badge
                              variant={isRouter ? 'purple' : 'info'}
                              className="text-[10px] capitalize"
                            >
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
                          className="h-7 text-xs gap-1"
                          title="Create profile and connect immediately"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Connect
                        </Button>
                      </div>
                    </div>

                    {/* Discovered Locators List */}
                    <div className="space-y-1 bg-muted/40 rounded-md p-2.5 border">
                      <span className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Discovered Locators ({node.locators?.length || 0}):
                      </span>
                      {node.locators && node.locators.length > 0 ? (
                        <div className="space-y-1">
                          {node.locators.map((loc, lIdx) => (
                            <div
                              key={lIdx}
                              className="flex items-center justify-between rounded bg-background px-2.5 py-1 text-xs font-mono"
                            >
                              <span className="text-foreground select-all">{loc}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(loc)}
                                className="text-muted-foreground hover:text-foreground p-0.5 ml-2"
                                title="Copy Locator"
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
                      ) : (
                        <div className="text-xs text-muted-foreground italic">
                          No unicast locators reported (multicast transport)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t bg-muted/20 flex items-center justify-between sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            Scouting uses Zenoh native UDP multicast protocol
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScoutModal;
