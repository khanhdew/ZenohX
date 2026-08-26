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

import React from 'react';
import { Radio, Network, RefreshCw } from 'lucide-react';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { SimpleTooltip } from '../../ui/tooltip';

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
          <SimpleTooltip content="Discover local peers and routers automatically on 224.0.0.224:7446.">
            <Label className="text-xs font-medium flex items-center gap-1.5 cursor-pointer">
              <Radio className="w-3.5 h-3.5 text-amber-500" />
              <span>Multicast Scouting (LAN)</span>
            </Label>
          </SimpleTooltip>
          <Switch checked={scoutMulticast} onCheckedChange={setScoutMulticast} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <SimpleTooltip content="Propagate topology knowledge through peer-to-peer gossip exchanges.">
            <Label className="text-xs font-medium flex items-center gap-1.5 cursor-pointer">
              <Network className="w-3.5 h-3.5 text-indigo-500" />
              <span>Gossip-Based Topology Discovery</span>
            </Label>
          </SimpleTooltip>
          <Switch checked={scoutGossip} onCheckedChange={setScoutGossip} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <SimpleTooltip content="Automatically retry upstream links in the background without dropping node lifecycle.">
            <Label className="text-xs font-medium flex items-center gap-1.5 cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
              <span>Background Reconnection (Exponential Backoff)</span>
            </Label>
          </SimpleTooltip>
          <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
        </div>
      </div>
    </div>
  );
};
