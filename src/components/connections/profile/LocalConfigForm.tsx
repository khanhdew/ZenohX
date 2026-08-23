import React from 'react';
import { Zap, Lock, Shield, ShieldCheck } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';

export interface LocalConfigFormProps {
  localName: string;
  setLocalName: (val: string) => void;
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

export const LocalConfigForm: React.FC<LocalConfigFormProps> = ({
  localName,
  setLocalName,
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
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="local-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="local-name"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          placeholder="Local Peer"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* LAN Explanation Card */}
      <div className="rounded-lg border p-3 bg-muted/20 space-y-1.5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            Automatic Local Discovery (P2P Peer)
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          ZenohX will automatically discover and connect to all Zenoh peers, routers, and queryables on your local network using UDP multicast (<code className="font-mono text-[10px]">224.0.0.224:7446</code>).
        </p>
      </div>

      {/* TLS / mTLS Security Section */}
      <div className="rounded-lg border p-3 bg-muted/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              Enable TLS Encryption & mTLS
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Secure peer-to-peer communications with TLS and mutual authentication.
            </p>
          </div>
          <Switch
            checked={enableTls}
            onCheckedChange={(checked) => {
              setEnableTls(checked);
            }}
          />
        </div>

        {enableTls && (
          <div className="space-y-3 pt-2 border-t">
            {/* Strict TLS-Only Mode Toggle */}
            {setTlsOnly && (
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Strict TLS-Only Mode
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Disables unencrypted TCP/UDP fallback; only connects to verified TLS peers.
                  </p>
                </div>
                <Switch
                  checked={tlsOnly}
                  onCheckedChange={setTlsOnly}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  Custom Certificate / Key (mTLS)
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Provide custom CA, server/client certificate, and private key.
                </p>
              </div>
              <Switch
                checked={useCustomTls}
                onCheckedChange={setUseCustomTls}
              />
            </div>

            {useCustomTls && (
              <div className="space-y-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    Root CA Certificate (PEM Path)
                  </Label>
                  <Input
                    value={caCert}
                    onChange={(e) => setCaCert(e.target.value)}
                    placeholder="e.g. /path/to/ca.crt (Optional if self-signed)"
                    className="h-7 font-mono text-[11px] bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    Certificate (PEM Path) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={clientCert}
                    onChange={(e) => setClientCert(e.target.value)}
                    placeholder="/path/to/server.crt"
                    className="h-7 font-mono text-[11px] bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    Private Key (PEM Path) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={clientKey}
                    onChange={(e) => setClientKey(e.target.value)}
                    placeholder="/path/to/server.key"
                    className="h-7 font-mono text-[11px] bg-background"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
