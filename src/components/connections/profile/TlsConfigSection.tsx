import React from 'react';
import { Lock } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';

export interface TlsConfigSectionProps {
  useCustomTls: boolean;
  setUseCustomTls: (val: boolean) => void;
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
  caCert,
  setCaCert,
  clientCert,
  setClientCert,
  clientKey,
  setClientKey,
}) => {
  return (
    <div className="space-y-2.5 border rounded-lg p-3 bg-muted/10">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            Custom TLS Certificates (mTLS)
          </span>
          <p className="text-[10px] text-muted-foreground">
            Supply custom Root CA or client certificate/key.
          </p>
        </div>
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
