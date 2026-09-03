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
import {
  Plus,
  Trash2,
  Link,
  Radio,
} from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { useActiveMdnsHost } from '../../../stores/settingsStore';

export interface PeerConfigFormProps {
  peerName: string;
  setPeerName: (val: string) => void;
  connectLocators: string[];
  addConnectLocator: () => void;
  updateConnectLocator: (index: number, val: string) => void;
  removeConnectLocator: (index: number) => void;
  listenLocators?: string[];
  addListenLocator?: () => void;
  updateListenLocator?: (index: number, val: string) => void;
  removeListenLocator?: (index: number) => void;
  scoutMulticast?: boolean;
  setScoutMulticast?: (val: boolean) => void;
  scoutGossip?: boolean;
  setScoutGossip?: (val: boolean) => void;
  enableTls?: boolean;
  setEnableTls?: (val: boolean) => void;
  useCustomTls?: boolean;
  setUseCustomTls?: (val: boolean) => void;
  tlsOnly?: boolean;
  setTlsOnly?: (val: boolean) => void;
  caCert?: string;
  setCaCert?: (val: string) => void;
  clientCert?: string;
  setClientCert?: (val: string) => void;
  clientKey?: string;
  setClientKey?: (val: string) => void;
}

export const PeerConfigForm: React.FC<PeerConfigFormProps> = ({
  peerName,
  setPeerName,
  connectLocators,
  addConnectLocator,
  updateConnectLocator,
  removeConnectLocator,
  listenLocators = [],
  addListenLocator,
  updateListenLocator,
  removeListenLocator,
}) => {
  const activeMdnsHost = useActiveMdnsHost();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="peer-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="peer-name"
          value={peerName}
          onChange={(e) => setPeerName(e.target.value)}
          placeholder="Local Peer"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* Optional Direct Connect Locators */}
      <div className="space-y-2 pt-1 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Link className="w-3.5 h-3.5 text-primary" />
            <span>Direct Connect Links (Optional)</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addConnectLocator}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Link</span>
          </Button>
        </div>

        {connectLocators.length === 0 ? (
          <div className="p-2 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground">
            No static links configured. Peers will discover each other via LAN multicast & gossip.
          </div>
        ) : (
          <div className="space-y-1.5">
            {connectLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateConnectLocator(idx, e.target.value)}
                  placeholder={`tcp/${activeMdnsHost}:7447`}
                  className="h-8 text-xs font-mono bg-background flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => removeConnectLocator(idx)}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                  title="Remove link locator"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional Listen Endpoints */}
      {addListenLocator && updateListenLocator && removeListenLocator && (
        <div className="space-y-2 pt-1 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-500" />
              <span>Listen Locators (Optional / Dynamic)</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addListenLocator}
              className="h-7 text-xs gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Locator</span>
            </Button>
          </div>

          {listenLocators.length === 0 ? (
            <div className="p-2 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground">
              Dynamic ephemeral port (default port: 0 auto-assigned by OS).
            </div>
          ) : (
            <div className="space-y-1.5">
              {listenLocators.map((loc, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={loc}
                    onChange={(e) => updateListenLocator(idx, e.target.value)}
                    placeholder={`tcp/${activeMdnsHost}:0`}
                    className="h-8 text-xs font-mono bg-background flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    onClick={() => removeListenLocator(idx)}
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                    title="Remove listen locator"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
