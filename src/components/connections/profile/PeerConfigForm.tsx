import React from 'react';
import { Zap, Lock, Shield, ShieldCheck, Plus, Trash2, Link } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';

export interface PeerConfigFormProps {
  peerName: string;
  setPeerName: (val: string) => void;
  connectLocators: string[];
  addConnectLocator: () => void;
  updateConnectLocator: (index: number, val: string) => void;
  removeConnectLocator: (index: number) => void;
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

export const PeerConfigForm: React.FC<PeerConfigFormProps> = ({
  peerName,
  setPeerName,
  connectLocators,
  addConnectLocator,
  updateConnectLocator,
  removeConnectLocator,
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

      {/* LAN Explanation Card */}
      <div className="rounded-lg border p-3 bg-muted/20 space-y-1.5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            Automatic Local Discovery (P2P Mesh)
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          ZenohX automatically discovers other Zenoh peers and routers on your local subnet using UDP multicast (<code className="font-mono text-[10px]">224.0.0.224:7446</code>).
        </p>
      </div>

      {/* Optional Direct Connect Locators (e.g. to connect directly to a router or remote peer) */}
      <div className="space-y-2 pt-1 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-primary" />
              Direct Connect Locators (Optional)
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Connect directly to a specific router or peer (e.g. <code className="font-mono text-[10px]">tcp/127.0.0.1:7447</code>).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addConnectLocator}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Locator</span>
          </Button>
        </div>

        {connectLocators.length === 0 ? (
          <div className="p-2.5 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Using pure multicast auto-discovery (no static links).</span>
            <button
              type="button"
              onClick={() => {
                addConnectLocator();
                setTimeout(() => updateConnectLocator(0, 'tcp/127.0.0.1:7447'), 0);
              }}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              + Link Localhost Router
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {connectLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateConnectLocator(idx, e.target.value)}
                  placeholder="tcp/127.0.0.1:7447 or tcp/192.168.1.50:7447"
                  className="h-8 text-xs font-mono bg-background flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => removeConnectLocator(idx)}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                  title="Remove locator"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
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
                    Only accept TLS-encrypted links (drop plaintext connections).
                  </p>
                </div>
                <Switch checked={tlsOnly} onCheckedChange={setTlsOnly} />
              </div>
            )}

            {/* Custom TLS / Certificates Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  Custom Certificates / mTLS
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Provide custom Root CA and client certificate/key files.
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
