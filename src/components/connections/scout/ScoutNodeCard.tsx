import React from 'react';
import {
  Server,
  Zap,
  Lock,
  Globe,
  Radio,
  Copy,
  Check,
  Plus,
  Play,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import type { ScoutedNode } from '../../../types/zenoh';
import { getLocatorProtocol } from '../../../lib/tls';

export interface NodeTlsState {
  selectedLocator: string;
  enableTls: boolean;
  useCustomTls: boolean;
  caCert: string;
  clientCert: string;
  clientKey: string;
  showTlsOptions: boolean;
}

export interface ScoutNodeCardProps {
  node: ScoutedNode;
  nodeState: NodeTlsState;
  updateNodeState: (patch: Partial<NodeTlsState>) => void;
  isLoading: boolean;
  copiedText: string | null;
  onCopy: (text: string) => void;
  onOpenInEditor: (node: ScoutedNode) => void;
  onCreateProfile: (node: ScoutedNode) => void;
  onConnectDirectly: (node: ScoutedNode) => void;
}

export const ScoutNodeCard: React.FC<ScoutNodeCardProps> = ({
  node,
  nodeState,
  updateNodeState,
  isLoading,
  copiedText,
  onCopy,
  onOpenInEditor,
  onCreateProfile,
  onConnectDirectly,
}) => {
  const isRouter = (node.what || '').toLowerCase() === 'router';
  const hasTlsLocator = Boolean(
    node.locators && node.locators.some((l) => getLocatorProtocol(l) === 'tls')
  );

  const getProtocolIcon = (proto: string) => {
    switch (proto) {
      case 'tls':
        return <Lock className="w-3 h-3 text-emerald-500 shrink-0" />;
      case 'tcp':
        return <Globe className="w-3 h-3 text-blue-500 shrink-0" />;
      case 'quic':
        return <Zap className="w-3 h-3 text-amber-500 shrink-0" />;
      case 'udp':
        return <Radio className="w-3 h-3 text-purple-500 shrink-0" />;
      default:
        return <Globe className="w-3 h-3 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3.5 space-y-3 transition-colors hover:border-foreground/30 shadow-xs">
      {/* Node Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-muted/80 text-foreground">
            {isRouter ? (
              <Server className="w-4 h-4 text-primary" />
            ) : (
              <Zap className="w-4 h-4 text-amber-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                Zenoh {isRouter ? 'Router' : 'Peer'}
              </span>
              <Badge variant="secondary" className="text-[10px] capitalize">
                {node.what}
              </Badge>
              {hasTlsLocator && (
                <Badge className="text-[9px] h-4 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 gap-1 px-1.5 font-normal">
                  <Lock className="w-2.5 h-2.5" />
                  TLS Capable
                </Badge>
              )}
            </div>
            {/* ZID */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] text-muted-foreground">ZID:</span>
              <code className="font-mono text-xs text-foreground select-all font-medium">
                {node.zid}
              </code>
              <button
                type="button"
                onClick={() => onCopy(node.zid)}
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
            variant="ghost"
            size="sm"
            onClick={() => onOpenInEditor(node)}
            disabled={isLoading}
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="Configure full connection settings in side panel"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span className="hidden sm:inline">Connect UX</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreateProfile(node)}
            disabled={isLoading}
            className="h-7 text-xs gap-1"
            title="Save as connection profile"
          >
            <Plus className="w-3 h-3" />
            Profile
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => onConnectDirectly(node)}
            disabled={isLoading}
            className={`h-7 text-xs gap-1.5 font-medium ${
              nodeState.enableTls
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : ''
            }`}
            title="Establish session immediately"
          >
            {nodeState.enableTls ? (
              <Lock className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            <span>{nodeState.enableTls ? 'Connect (TLS)' : 'Connect'}</span>
          </Button>
        </div>
      </div>

      {/* Locators Selection */}
      {node.locators && node.locators.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Available Locators ({node.locators.length}):
            </span>
            {node.locators.length > 1 && (
              <span className="text-[10px] text-muted-foreground">
                Select endpoint to connect
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {node.locators.map((loc, lIdx) => {
              const proto = getLocatorProtocol(loc);
              const isSelected =
                nodeState.selectedLocator === loc ||
                (!nodeState.selectedLocator && lIdx === 0);
              const isTls = proto === 'tls';

              return (
                <div
                  key={lIdx}
                  onClick={() => {
                    updateNodeState({
                      selectedLocator: loc,
                      enableTls: isTls,
                    });
                  }}
                  className={`cursor-pointer rounded-md border p-2 flex items-center justify-between gap-2 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border bg-muted/30 hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {getProtocolIcon(proto)}
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-xs text-foreground block truncate">
                        {loc}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isTls ? (
                      <Badge className="text-[9px] h-3.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none px-1">
                        TLS
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 uppercase">
                        {proto || 'LOC'}
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopy(loc);
                      }}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title="Copy locator"
                    >
                      {copiedText === loc ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TLS & Security Options Accordion */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() =>
            updateNodeState({
              showTlsOptions: !nodeState.showTlsOptions,
            })
          }
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          {nodeState.showTlsOptions ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          <span>
            {nodeState.showTlsOptions ? 'Hide TLS & Certificates' : 'TLS & Certificate Options'}
          </span>
        </button>

        {nodeState.showTlsOptions && (
          <div className="mt-2.5 p-3 rounded-md bg-muted/20 border space-y-3 animate-in fade-in duration-150">
            {/* Master TLS Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-emerald-500" />
                  Enable TLS Encryption
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Encrypt transport channel using TLS.
                </p>
              </div>
              <Switch
                checked={nodeState.enableTls}
                onCheckedChange={(checked) =>
                  updateNodeState({ enableTls: checked })
                }
              />
            </div>

            {nodeState.enableTls && (
              <div className="space-y-3 pt-2 border-t">
                {/* System Root CAs or Custom */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Shield className="w-3 h-3 text-muted-foreground" />
                      Custom Certificates (mTLS)
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Use custom CA or client certificate for authentication.
                    </p>
                  </div>
                  <Switch
                    checked={nodeState.useCustomTls}
                    onCheckedChange={(checked) =>
                      updateNodeState({ useCustomTls: checked })
                    }
                  />
                </div>

                {!nodeState.useCustomTls ? (
                  <p className="text-[10px] text-muted-foreground bg-muted/40 p-2 rounded border">
                    ✓ Uses default system root certificates for peer validation.
                  </p>
                ) : (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-muted-foreground">
                        Root CA Certificate (PEM Path)
                      </Label>
                      <Input
                        value={nodeState.caCert}
                        onChange={(e) =>
                          updateNodeState({ caCert: e.target.value })
                        }
                        placeholder="/path/to/ca.pem"
                        className="h-7 font-mono text-[11px] bg-background"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-muted-foreground">
                          Client Certificate (PEM Path)
                        </Label>
                        <Input
                          value={nodeState.clientCert}
                          onChange={(e) =>
                            updateNodeState({ clientCert: e.target.value })
                          }
                          placeholder="/path/to/client.pem"
                          className="h-7 font-mono text-[11px] bg-background"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-muted-foreground">
                          Client Private Key (PEM Path)
                        </Label>
                        <Input
                          value={nodeState.clientKey}
                          onChange={(e) =>
                            updateNodeState({ clientKey: e.target.value })
                          }
                          placeholder="/path/to/key.pem"
                          className="h-7 font-mono text-[11px] bg-background"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
