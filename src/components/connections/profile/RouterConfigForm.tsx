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
  Globe,
  Lock,
  Zap,
  Radio,
  Wifi,
  ShieldCheck,
  HardDrive,
  Plus,
  Trash2,
} from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { SimpleTooltip } from '../../ui/tooltip';
import { type TransportProtocol, SUPPORTED_TRANSPORT_PROTOCOLS } from '../../../lib/tls';

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

function getProtocolIcon(protocol: TransportProtocol) {
  switch (protocol) {
    case 'tcp':
      return Globe;
    case 'tls':
      return Lock;
    case 'quic':
      return Zap;
    case 'udp':
      return Radio;
    case 'ws':
      return Wifi;
    case 'wss':
      return ShieldCheck;
    case 'unix':
      return HardDrive;
    default:
      return Globe;
  }
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

      {/* Customizable Listen Endpoints Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SimpleTooltip content="Bind multi-transport network interfaces (TCP, TLS, WebSocket, Unix Socket, QUIC) for incoming node connections.">
            <Label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Server className="w-3.5 h-3.5 text-indigo-500" />
              <span>Listen Endpoints ({listenEndpoints.length})</span>
            </Label>
          </SimpleTooltip>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addListenEndpoint}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Endpoint</span>
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

                {/* Protocol selector pills for all 7 protocols */}
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                  {SUPPORTED_TRANSPORT_PROTOCOLS.map((p) => {
                    const Icon = getProtocolIcon(p.id);
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
                            updates.host = '0.0.0.0';
                            updates.port = p.defaultPort || '7447';
                          }
                          updateListenEndpoint(ep.id, updates);
                        }}
                        className={`h-7 px-1 rounded-md border text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                            : 'border-border bg-background hover:bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        <span>{p.id.toUpperCase()}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic input row: Unix path vs Network Host+Port */}
                {isUnix ? (
                  <div className="space-y-1.5">
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
                    {/* Quick Path helper chips */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[9px] text-muted-foreground">Quick Paths:</span>
                      <button
                        type="button"
                        onClick={() => updateListenEndpoint(ep.id, { host: '/tmp/zenoh.sock', port: '' })}
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          ep.host === '/tmp/zenoh.sock'
                            ? 'border-primary text-primary bg-primary/5 font-semibold'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        /tmp/zenoh.sock
                      </button>
                      <button
                        type="button"
                        onClick={() => updateListenEndpoint(ep.id, { host: '/tmp/zenoh-router.sock', port: '' })}
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          ep.host === '/tmp/zenoh-router.sock'
                            ? 'border-primary text-primary bg-primary/5 font-semibold'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        /tmp/zenoh-router.sock
                      </button>
                      <button
                        type="button"
                        onClick={() => updateListenEndpoint(ep.id, { host: '/var/run/zenoh.sock', port: '' })}
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          ep.host === '/var/run/zenoh.sock'
                            ? 'border-primary text-primary bg-primary/5 font-semibold'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        /var/run/zenoh.sock
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Host & Port inputs */}
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
                          placeholder="0.0.0.0 or [::]"
                          className="h-8 text-xs font-mono bg-background"
                        />
                      </div>
                      <div className="w-24">
                        <Input
                          value={ep.port}
                          onChange={(e) =>
                            updateListenEndpoint(ep.id, { port: e.target.value })
                          }
                          placeholder="7447"
                          className="h-8 text-xs font-mono bg-background text-center"
                        />
                      </div>
                    </div>

                    {/* Quick Host & Port helper pills */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[9px] text-muted-foreground">Quick Hosts:</span>
                        <button
                          type="button"
                          onClick={() => updateListenEndpoint(ep.id, { host: '0.0.0.0' })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            ep.host === '0.0.0.0'
                              ? 'border-primary text-primary bg-primary/5 font-semibold'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          0.0.0.0 (IPv4 All)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateListenEndpoint(ep.id, { host: '::' })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            ep.host === '::' || ep.host === '[::]'
                              ? 'border-primary text-primary bg-primary/5 font-semibold'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          :: (IPv6 All)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateListenEndpoint(ep.id, { host: '127.0.0.1' })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            ep.host === '127.0.0.1'
                              ? 'border-primary text-primary bg-primary/5 font-semibold'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          127.0.0.1 (IPv4 Local)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateListenEndpoint(ep.id, { host: '::1' })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            ep.host === '::1' || ep.host === '[::1]'
                              ? 'border-primary text-primary bg-primary/5 font-semibold'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          ::1 (IPv6 Local)
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[9px] text-muted-foreground">Quick Ports:</span>
                        <button
                          type="button"
                          onClick={() => updateListenEndpoint(ep.id, { port: '7447' })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            ep.port === '7447'
                              ? 'border-primary text-primary bg-primary/5 font-semibold'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          7447
                        </button>
                        <button
                          type="button"
                          onClick={() => updateListenEndpoint(ep.id, { port: '8080' })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            ep.port === '8080'
                              ? 'border-primary text-primary bg-primary/5 font-semibold'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          8080
                        </button>
                        <button
                          type="button"
                          onClick={() => updateListenEndpoint(ep.id, { port: '0' })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            ep.port === '0'
                              ? 'border-primary text-primary bg-primary/5 font-semibold'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          0 Auto
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upstream Router Connect Locators */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <SimpleTooltip content="Connect this router to upstream cloud/edge routers for multi-router routing.">
            <Label className="text-xs font-semibold cursor-pointer">
              Upstream Routers (Hierarchical Mesh)
            </Label>
          </SimpleTooltip>
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
          <div className="p-2.5 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground text-center">
            Operating as standalone root router (no upstream router links).
          </div>
        ) : (
          <div className="space-y-1.5">
            {routerConnectLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateRouterConnectLocator(idx, e.target.value)}
                  placeholder="tcp/cloud.router.zenoh.io:7447"
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
