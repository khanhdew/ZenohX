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
  Server,
  Radio,
  Plus,
  Trash2,
} from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { type TransportProtocol, SUPPORTED_TRANSPORT_PROTOCOLS } from '../../../lib/tls';
import { useActiveMdnsHost } from '../../../stores/settingsStore';

export interface RouterListenEndpoint {
  id: string;
  protocol: TransportProtocol;
  host: string;
  port: string;
}

export interface RouterConfigFormProps {
  routerName: string;
  setRouterName: (val: string) => void;
  listenEndpoints: RouterListenEndpoint[];
  addListenEndpoint: () => void;
  updateListenEndpoint: (id: string, updates: Partial<RouterListenEndpoint>) => void;
  removeListenEndpoint: (id: string) => void;
  routerScoutMulticast?: boolean;
  setRouterScoutMulticast?: (val: boolean) => void;
  routerScoutGossip?: boolean;
  setRouterScoutGossip?: (val: boolean) => void;
  routerConnectLocators: string[];
  addRouterConnectLocator: () => void;
  updateRouterConnectLocator: (index: number, val: string) => void;
  removeRouterConnectLocator: (index: number) => void;
}

export const RouterConfigForm: React.FC<RouterConfigFormProps> = ({
  routerName,
  setRouterName,
  listenEndpoints,
  addListenEndpoint,
  updateListenEndpoint,
  removeListenEndpoint,
  routerConnectLocators,
  addRouterConnectLocator,
  updateRouterConnectLocator,
  removeRouterConnectLocator,
}) => {
  const activeMdnsHost = useActiveMdnsHost();
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="router-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="router-name"
          value={routerName}
          onChange={(e) => setRouterName(e.target.value)}
          placeholder="e.g. Local Edge Router"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* Customizable Listen Locators Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-indigo-500" />
            <span>Listen Locators ({listenEndpoints.length})</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addListenEndpoint}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Locator</span>
          </Button>
        </div>

        <div className="space-y-2.5">
          {listenEndpoints.map((ep, idx) => {
            const isUnix = ep.protocol === 'unix';

            return (
              <div
                key={ep.id}
                className="p-3 rounded-lg border bg-card/60 space-y-2.5 relative group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Endpoint #{idx + 1}
                  </span>
                  {listenEndpoints.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      onClick={() => removeListenEndpoint(ep.id)}
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      title="Remove endpoint"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {/* Protocol selector pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  {SUPPORTED_TRANSPORT_PROTOCOLS.map((p) => {
                    const isSelected = ep.protocol === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const updates: Partial<RouterListenEndpoint> = {
                            protocol: p.id,
                          };
                          if (p.id === 'unix' && (!ep.host || ep.host === '0.0.0.0' || ep.host === '127.0.0.1')) {
                            updates.host = '/tmp/zenoh.sock';
                            updates.port = '';
                          } else if (p.id !== 'unix' && (ep.host.startsWith('/') || !ep.host)) {
                            updates.host = activeMdnsHost;
                            updates.port = '0';
                          }
                          updateListenEndpoint(ep.id, updates);
                        }}
                        className={`h-6 px-2 rounded border text-[10px] font-medium transition-colors ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                            : 'border-border bg-background hover:bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        {p.id.toUpperCase()}
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic input row: Unix path vs Network Host+Port */}
                {isUnix ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">
                      Unix Domain Socket Path
                    </Label>
                    <Input
                      value={ep.host}
                      onChange={(e) =>
                        updateListenEndpoint(ep.id, { host: e.target.value, port: '' })
                      }
                      placeholder="/tmp/zenoh.sock"
                      className="h-8 text-xs font-mono bg-background"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        value={ep.host}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.includes(':') && !val.startsWith('[')) {
                            const colonIdx = val.lastIndexOf(':');
                            const h = val.slice(0, colonIdx).trim();
                            const p = val.slice(colonIdx + 1).trim();
                            if (/^\d+$/.test(p)) {
                              updateListenEndpoint(ep.id, { host: h, port: p });
                              return;
                            }
                          }
                          updateListenEndpoint(ep.id, { host: val });
                        }}
                        placeholder={activeMdnsHost}
                        className="h-8 text-xs font-mono bg-background"
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        value={ep.port}
                        onChange={(e) =>
                          updateListenEndpoint(ep.id, { port: e.target.value })
                        }
                        placeholder="0"
                        title="Port (0 for dynamic auto-allocate)"
                        className="h-8 text-xs font-mono bg-background text-center"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* mDNS Hostname broadcast indicator */}
        <div className="p-2 rounded-md bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-700 dark:text-sky-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span>
              LAN mDNS: Advertised as <code className="font-mono font-semibold text-foreground px-1 py-0.5 rounded bg-background/50 border border-border/50">{activeMdnsHost}:{listenEndpoints[0]?.port || '0'}</code>
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">LAN Resolvable</span>
        </div>
      </div>

      {/* Upstream Router Connect Locators */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">
            Upstream Routers (Hierarchical Mesh)
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRouterConnectLocator}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Upstream</span>
          </Button>
        </div>

        {routerConnectLocators.length === 0 ? (
          <div className="p-2 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground">
            Standalone root router (no upstream router links).
          </div>
        ) : (
          <div className="space-y-1.5">
            {routerConnectLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateRouterConnectLocator(idx, e.target.value)}
                  placeholder={`tcp/${activeMdnsHost}:7447`}
                  className="h-8 text-xs font-mono bg-background flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => removeRouterConnectLocator(idx)}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                  title="Remove upstream locator"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
