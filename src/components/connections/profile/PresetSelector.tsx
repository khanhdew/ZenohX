import React from 'react';
import { Cloud, Home, SlidersHorizontal } from 'lucide-react';
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
        {/* Cloud / Remote Preset */}
        <button
          type="button"
          onClick={() => onSelectPreset('cloud')}
          className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
            preset === 'cloud'
              ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-primary" />
              Cloud Router
            </span>
            {preset === 'cloud' && (
              <Badge variant="default" className="text-[9px] h-3.5 px-1">
                Selected
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Connect to cloud or remote Zenoh router.
          </span>
        </button>

        {/* Local LAN Preset */}
        <button
          type="button"
          onClick={() => onSelectPreset('local')}
          className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
            preset === 'local'
              ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-emerald-500" />
              Local LAN
            </span>
            {preset === 'local' && (
              <Badge variant="default" className="text-[9px] h-3.5 px-1">
                Selected
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Auto-discover peers on local subnet.
          </span>
        </button>

        {/* Custom / Advanced Preset */}
        <button
          type="button"
          onClick={() => onSelectPreset('custom')}
          className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
            preset === 'custom'
              ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              Custom
            </span>
            {preset === 'custom' && (
              <Badge variant="default" className="text-[9px] h-3.5 px-1">
                Selected
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Raw locators, router mode & mTLS.
          </span>
        </button>
      </div>
    </div>
  );
};
