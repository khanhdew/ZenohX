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
  Shield,
  Radio,
} from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import {
  type TransportProtocol,
  parseLocator,
  SUPPORTED_TRANSPORT_PROTOCOLS,
} from '../../../lib/tls';
import { useActiveMdnsHost } from '../../../stores/settingsStore';

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
  const activeMdnsHost = useActiveMdnsHost();

  const parsed = parseLocator(clientLocator);
  const activeProtocol: TransportProtocol = (parsed?.protocol as TransportProtocol) || 'tcp';

  const handleProtocolClick = (protoId: TransportProtocol) => {
    if (protoId === 'unix') {
      setClientLocator('unixpipe//tmp/zenoh.sock');
      return;
    }

    if (parsed && parsed.protocol !== 'unix') {
      const protoMeta = SUPPORTED_TRANSPORT_PROTOCOLS.find((p) => p.id === protoId);
      const defaultPort = protoMeta?.defaultPort || '7447';
      const currentProtoMeta = SUPPORTED_TRANSPORT_PROTOCOLS.find((p) => p.id === parsed.protocol);
      const isDefaultPort = parsed.port === currentProtoMeta?.defaultPort || parsed.port === '7447';
      const targetPort = isDefaultPort ? defaultPort : (parsed.port || defaultPort);
      setClientLocator(`${protoId}/${parsed.host}:${targetPort}`);
    } else {
      const protoMeta = SUPPORTED_TRANSPORT_PROTOCOLS.find((p) => p.id === protoId);
      setClientLocator(`${protoId}/${activeMdnsHost}:${protoMeta?.defaultPort || '7447'}`);
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

      {/* Upstream Router Locator Input */}
      <div className="space-y-1">
        <Label htmlFor="client-locator" className="text-xs font-semibold flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-sky-500" />
          <span>Upstream Router Locator</span> <span className="text-destructive">*</span>
        </Label>

        <Input
          id="client-locator"
          value={clientLocator}
          onChange={(e) => setClientLocator(e.target.value)}
          placeholder={`tcp/${activeMdnsHost}:7447`}
          className="h-8 text-xs font-mono bg-background"
        />
      </div>

      {/* Transport Protocol Quick Switch */}
      <div className="space-y-1">
        <Label className="text-[11px] font-medium text-muted-foreground">Protocol</Label>
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {SUPPORTED_TRANSPORT_PROTOCOLS.map((p) => {
            const isSelected = activeProtocol === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProtocolClick(p.id)}
                className={`h-6 px-2 rounded border text-[10px] font-medium transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                {p.id.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* User Authentication */}
      <div className="space-y-2 pt-2 border-t">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
          <span>User Authentication (Optional)</span>
        </Label>
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
