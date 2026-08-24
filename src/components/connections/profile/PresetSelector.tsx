import React from 'react';
import { Cloud, Home, Server } from 'lucide-react';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import type { ConnectionPreset } from '../../../lib/tls';

export interface PresetSelectorProps {
  preset: ConnectionPreset;
  onSelectPreset: (preset: ConnectionPreset) => void;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  preset,
  onSelectPreset,
}) => {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Connection Type</Label>
      <div className="grid grid-cols-3 gap-2">
        {/* Client Mode Preset */}
        <button
          type="button"
          onClick={() => onSelectPreset('client')}
          className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
            preset === 'client'
              ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-primary" />
              Client Mode
            </span>
            {preset === 'client' && (
              <Badge variant="default" className="text-[9px] h-3.5 px-1">
                Selected
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Connect upstream to cloud or remote Zenoh router.
          </span>
        </button>

        {/* Peer Mode Preset */}
        <button
          type="button"
          onClick={() => onSelectPreset('peer')}
          className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
            preset === 'peer'
              ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-emerald-500" />
              Peer Mode
            </span>
            {preset === 'peer' && (
              <Badge variant="default" className="text-[9px] h-3.5 px-1">
                Selected
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            P2P mesh & auto-discover peers on LAN.
          </span>
        </button>

        {/* Router Mode Preset */}
        <button
          type="button"
          onClick={() => onSelectPreset('router')}
          className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
            preset === 'router'
              ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-500" />
              Router Mode
            </span>
            {preset === 'router' && (
              <Badge variant="default" className="text-[9px] h-3.5 px-1">
                Selected
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Operate as local Zenoh router & listen for nodes.
          </span>
        </button>
      </div>
    </div>
  );
};
