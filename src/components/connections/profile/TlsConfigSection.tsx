import React from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { SimpleTooltip } from '../../ui/tooltip';

export interface TlsConfigSectionProps {
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
      {/* Strict TLS-Only Toggle */}
      {setTlsOnly && (
        <div className="flex items-center justify-between pb-2 border-b">
          <SimpleTooltip content="Disables unencrypted TCP/UDP fallback; only connects to verified TLS nodes.">
            <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground cursor-pointer">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Strict TLS-Only Mode</span>
            </span>
          </SimpleTooltip>
          <Switch
            checked={tlsOnly}
            onCheckedChange={setTlsOnly}
          />
        </div>
      )}

      {/* Custom Certificates Toggle */}
      <div className="flex items-center justify-between">
        <SimpleTooltip content="Supply custom Root CA or client certificate/key for bidirectional verification.">
          <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground cursor-pointer">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Custom TLS Certificates (mTLS)</span>
          </span>
        </SimpleTooltip>
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
  );
};
