import React from 'react';
import { Radio, Network, RefreshCw } from 'lucide-react';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';

export interface MeshRoutingSectionProps {
  scoutMulticast: boolean;
  setScoutMulticast: (val: boolean) => void;
  scoutGossip: boolean;
  setScoutGossip: (val: boolean) => void;
  autoReconnect: boolean;
  setAutoReconnect: (val: boolean) => void;
}

export const MeshRoutingSection: React.FC<MeshRoutingSectionProps> = ({
  scoutMulticast,
  setScoutMulticast,
  scoutGossip,
  setScoutGossip,
  autoReconnect,
  setAutoReconnect,
}) => {
  return (
    <div className="space-y-3 p-3.5 rounded-lg border bg-muted/10">
      <Label className="text-xs font-semibold flex items-center gap-1.5">
        <Network className="w-3.5 h-3.5 text-primary" />
        Mesh Routing & Discovery Policy
      </Label>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-500" />
              Multicast Scouting (LAN)
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Discover local peers and routers automatically on 224.0.0.224:7446.
            </p>
          </div>
          <Switch checked={scoutMulticast} onCheckedChange={setScoutMulticast} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-indigo-500" />
              Gossip-Based Topology Discovery
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Propagate topology knowledge through peer-to-peer gossip exchanges.
            </p>
          </div>
          <Switch checked={scoutGossip} onCheckedChange={setScoutGossip} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
              Background Reconnection (Exponential Backoff)
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Automatically retry upstream links in the background without dropping node lifecycle.
            </p>
          </div>
          <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
        </div>
      </div>
    </div>
  );
};
