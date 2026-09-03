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
import { Lock, ShieldCheck } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';

export interface TlsConfigSectionProps {
  enableTls: boolean;
  setEnableTls: (val: boolean) => void;
  useCustomTls: boolean;
  setUseCustomTls: (val: boolean) => void;
  tlsOnly?: boolean;
  setTlsOnly?: (val: boolean) => void;
  caCert: string;
  setCaCert: (val: string) => void;
  clientCert: string;
  setClientCert: (val: string) => void;
  clientKey: string;
  setClientKey: (val: string) => void;
}

export const TlsConfigSection: React.FC<TlsConfigSectionProps> = ({
  enableTls,
  setEnableTls,
  useCustomTls,
  setUseCustomTls,
  tlsOnly = false,
  setTlsOnly,
  caCert,
  setCaCert,
  clientCert,
  setClientCert,
  clientKey,
  setClientKey,
}) => {
  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/10">
      {/* Primary Enable TLS Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <Lock className="w-3.5 h-3.5 text-primary" />
          <span>Enable TLS</span>
        </span>
        <Switch
          checked={enableTls}
          onCheckedChange={(checked) => {
            setEnableTls(checked);
            if (!checked) {
              setUseCustomTls(false);
              setTlsOnly?.(false);
            }
          }}
        />
      </div>

      {enableTls && (
        <div className="space-y-2.5 pt-2 border-t">
          {/* Strict TLS-Only Toggle */}
          {setTlsOnly && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Strict TLS-Only</span>
              </span>
              <Switch
                checked={tlsOnly}
                onCheckedChange={setTlsOnly}
              />
            </div>
          )}

          {/* Custom Certificates Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Custom Certificates (mTLS)</span>
            </span>
            <Switch
              checked={useCustomTls}
              onCheckedChange={setUseCustomTls}
            />
          </div>

          {useCustomTls && (
            <div className="space-y-2 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Root CA Path</Label>
                <Input
                  value={caCert}
                  onChange={(e) => setCaCert(e.target.value)}
                  placeholder="/path/to/ca.pem"
                  className="h-7 font-mono text-xs bg-background"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">Client Cert Path</Label>
                  <Input
                    value={clientCert}
                    onChange={(e) => setClientCert(e.target.value)}
                    placeholder="/path/to/client.crt"
                    className="h-7 font-mono text-xs bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">Client Key Path</Label>
                  <Input
                    value={clientKey}
                    onChange={(e) => setClientKey(e.target.value)}
                    placeholder="/path/to/client.key"
                    className="h-7 font-mono text-xs bg-background"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
