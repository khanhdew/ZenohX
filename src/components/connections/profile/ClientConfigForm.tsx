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
  Lock,
  Globe,
  Zap,
  Wifi,
  ShieldCheck,
  HardDrive,
  Shield,
  Radio,
} from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { SimpleTooltip } from '../../ui/tooltip';
import {
  type TransportProtocol,
  SUPPORTED_TRANSPORT_PROTOCOLS,
  parseLocator,
} from '../../../lib/tls';

export interface ClientConfigFormProps {
  clientName: string;
  setClientName: (val: string) => void;
  clientLocator: string;
  setClientLocator: (val: string) => void;
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
}

function getProtocolIcon(protocol: TransportProtocol) {
  switch (protocol) {
    case 'tcp':
      return Globe;
    case 'tls':
      return Lock;
    case 'quic':
      return Zap;
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

// Client supports upstream router connections across standard unicast transports
const CLIENT_PROTOCOLS = SUPPORTED_TRANSPORT_PROTOCOLS.filter((p) => p.id !== 'udp');

export const ClientConfigForm: React.FC<ClientConfigFormProps> = ({
  clientName,
  setClientName,
  clientLocator,
  setClientLocator,
  username,
  setUsername,
  password,
  setPassword,
}) => {
  const parsed = parseLocator(clientLocator);
  const activeProtocol: TransportProtocol = (parsed?.protocol as TransportProtocol) || 'tcp';

  const handleProtocolClick = (protoId: TransportProtocol) => {
    if (protoId === 'unix') {
      setClientLocator('unixpipe//tmp/zenoh.sock');
      return;
    }

    if (parsed && parsed.protocol !== 'unix') {
      const protoMeta = CLIENT_PROTOCOLS.find((p) => p.id === protoId);
      const defaultPort = protoMeta?.defaultPort || '7447';
      const currentProtoMeta = CLIENT_PROTOCOLS.find((p) => p.id === parsed.protocol);
      const isDefaultPort = parsed.port === currentProtoMeta?.defaultPort || parsed.port === '7447';
      const targetPort = isDefaultPort ? defaultPort : (parsed.port || defaultPort);
      setClientLocator(`${protoId}/${parsed.host}:${targetPort}`);
    } else {
      const protoMeta = CLIENT_PROTOCOLS.find((p) => p.id === protoId);
      setClientLocator(`${protoId}/127.0.0.1:${protoMeta?.defaultPort || '7447'}`);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="client-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="client-name"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="e.g. Edge Client"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* Upstream Router Locator Input (Unified Single Input) */}
      <div className="space-y-1.5">
        <SimpleTooltip content="Enter complete locator (e.g. tcp/172.66.1.1:7447, tls/cloud.zenoh.io:7446, or unixpipe//tmp/zenoh.sock).">
          <Label htmlFor="client-locator" className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Radio className="w-3.5 h-3.5 text-sky-500" />
            <span>Upstream Router Locator</span> <span className="text-destructive">*</span>
          </Label>
        </SimpleTooltip>

        <Input
          id="client-locator"
          value={clientLocator}
          onChange={(e) => setClientLocator(e.target.value)}
          placeholder="tcp/172.66.1.1:7447 or tls/router.zenoh.io:7446"
          className="h-8 text-xs font-mono bg-background"
        />

        {/* Quick Fill suggestions */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[9px] text-muted-foreground">Quick Fill:</span>
          <button
            type="button"
            onClick={() => setClientLocator('tcp/127.0.0.1:7447')}
            className={`text-[9px] px-1.5 py-0.5 rounded border ${
              clientLocator === 'tcp/127.0.0.1:7447'
                ? 'border-primary text-primary bg-primary/5 font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            tcp/127.0.0.1:7447
          </button>
          <button
            type="button"
            onClick={() => setClientLocator('tcp/demo.zenoh.io:7447')}
            className={`text-[9px] px-1.5 py-0.5 rounded border ${
              clientLocator === 'tcp/demo.zenoh.io:7447'
                ? 'border-primary text-primary bg-primary/5 font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            tcp/demo.zenoh.io:7447
          </button>
          <button
            type="button"
            onClick={() => setClientLocator('tls/demo.zenoh.io:7446')}
            className={`text-[9px] px-1.5 py-0.5 rounded border ${
              clientLocator === 'tls/demo.zenoh.io:7446'
                ? 'border-primary text-primary bg-primary/5 font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            tls/demo.zenoh.io:7446
          </button>
          <button
            type="button"
            onClick={() => setClientLocator('ws/127.0.0.1:8080')}
            className={`text-[9px] px-1.5 py-0.5 rounded border ${
              clientLocator === 'ws/127.0.0.1:8080'
                ? 'border-primary text-primary bg-primary/5 font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            ws/127.0.0.1:8080
          </button>
          <button
            type="button"
            onClick={() => setClientLocator('unixpipe//tmp/zenoh.sock')}
            className={`text-[9px] px-1.5 py-0.5 rounded border ${
              clientLocator === 'unixpipe//tmp/zenoh.sock'
                ? 'border-primary text-primary bg-primary/5 font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            /tmp/zenoh.sock
          </button>
        </div>
      </div>

      {/* Transport Protocol Quick Switch */}
      <div className="space-y-1.5">
        <SimpleTooltip content="Quickly switch transport protocol for the locator above.">
          <Label className="text-[11px] font-medium text-muted-foreground cursor-pointer">Protocol Switcher</Label>
        </SimpleTooltip>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {CLIENT_PROTOCOLS.map((p) => {
            const Icon = getProtocolIcon(p.id);
            const isSelected = activeProtocol === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProtocolClick(p.id)}
                className={`h-7 px-2 rounded-md border text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span>{p.id.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* User Authentication */}
      <div className="space-y-2 pt-2 border-t">
        <SimpleTooltip content="Zenoh user credentials or password token passed during session handshake.">
          <Label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <span>User Authentication (Optional)</span>
          </Label>
        </SimpleTooltip>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="h-8 text-xs bg-background"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password / Token"
            className="h-8 text-xs bg-background"
          />
        </div>
      </div>
    </div>
  );
};
