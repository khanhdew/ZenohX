import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Power,
  Plus,
  Radio,
  ShieldCheck,
  ShieldAlert,
  Server,
  Users,
  Laptop,
  Settings,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useConnectionStore } from '../../stores/connectionStore';
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
  const [actionLoading, setActionLoading] = useState(false);

  const connect = useConnectionStore((s) => s.connect);
  const saveProfile = useConnectionStore((s) => s.saveProfile);
  const profiles = useConnectionStore((s) => s.profiles);

  if (!node) return null;

  const existingProfile = findMatchingProfile(profiles, node);

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

            {node.isTls ? (
              <Badge
                variant="secondary"
                className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              >
                <ShieldCheck className="w-3 h-3" />
                TLS Encrypted
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <ShieldAlert className="w-3 h-3" />
                Plaintext
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
            <p className="text-[11px] text-muted-foreground italic">No locators reported</p>
          ) : (
            <div className="space-y-1">
              {node.locators.map((loc, idx) => {
                const proto = extractLocatorProtocol(loc);
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
      </div>

      {/* Action Buttons Footer */}
      <div className="p-3 border-t bg-muted/20 space-y-2">
        {node.type === 'router' && (
          <Button
            size="sm"
            onClick={handleConnectDirectly}
            disabled={actionLoading}
            className="w-full h-8 text-xs gap-1.5 font-medium"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{node.status === 'connected' ? 'Connected' : 'Connect to Router'}</span>
          </Button>
        )}

        {node.type === 'peer' && (
          <div className="p-2 rounded-md bg-muted/60 border text-[11px] text-muted-foreground flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Discovered LAN Peer. Automatically meshed in peer mode.</span>
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
