import React from 'react';
import {
  Zap,
  Lock,
  Shield,
  ShieldCheck,
  Plus,
  Trash2,
  Link,
  Radio,
  Network,
} from 'lucide-react';
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
  listenLocators?: string[];
  addListenLocator?: () => void;
  updateListenLocator?: (index: number, val: string) => void;
  removeListenLocator?: (index: number) => void;
  scoutMulticast?: boolean;
  setScoutMulticast?: (val: boolean) => void;
  scoutGossip?: boolean;
  setScoutGossip?: (val: boolean) => void;
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
  listenLocators = [],
  addListenLocator,
  updateListenLocator,
  removeListenLocator,
  scoutMulticast = true,
  setScoutMulticast,
  scoutGossip = true,
  setScoutGossip,
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

      {/* LAN Multicast & Gossip Discovery Card */}
      <div className="rounded-lg border p-3 bg-muted/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-500 shrink-0" />
              <Label className="text-xs font-semibold text-foreground">
                UDP Multicast Auto-Discovery
              </Label>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Auto-discover other Zenoh peers & routers on local subnet (<code className="font-mono text-[10px]">224.0.0.224:7446</code>).
            </p>
          </div>
          {setScoutMulticast && (
            <Switch
              checked={scoutMulticast}
              onCheckedChange={setScoutMulticast}
            />
          )}
        </div>

        {setScoutGossip && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <Label className="text-xs font-medium text-foreground">
                  Gossip Peer Scouting
                </Label>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Exchange reachable peer topology descriptors across direct links.
              </p>
            </div>
            <Switch
              checked={scoutGossip}
              onCheckedChange={setScoutGossip}
            />
          </div>
        )}
      </div>

      {/* Optional Direct Connect Locators (to remote peers or routers) */}
      <div className="space-y-2 pt-1 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-primary" />
              Direct Connect Links (Optional)
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Explicit unicast links to remote peers or upstream routers.
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
            <span>Add Link</span>
          </Button>
        </div>

        {connectLocators.length === 0 ? (
          <div className="p-2.5 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Pure multicast auto-discovery (no static outbound links).</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  addConnectLocator();
                  setTimeout(() => updateConnectLocator(0, 'tcp/127.0.0.1:7447'), 0);
                }}
                className="text-[10px] font-medium text-primary hover:underline"
              >
                + Link Local Router
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {connectLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateConnectLocator(idx, e.target.value)}
                  placeholder="tcp/127.0.0.1:7447 or tls/peer.domain.com:7446"
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

      {/* Optional Static Listen Endpoints */}
      {addListenLocator && updateListenLocator && removeListenLocator && (
        <div className="space-y-2 pt-1 border-t">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                Static Listen Endpoints (Optional)
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Allow inbound direct connections from non-multicast peers.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addListenLocator}
              className="h-7 text-xs gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Listener</span>
            </Button>
          </div>

          {listenLocators.length === 0 ? (
            <div className="p-2.5 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Ephemeral listener (default dynamic port).</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    addListenLocator();
                    setTimeout(() => updateListenLocator(0, 'tcp/0.0.0.0:7447'), 0);
                  }}
                  className="text-[10px] font-medium text-primary hover:underline"
                >
                  + Bind TCP:7447
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {listenLocators.map((loc, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={loc}
                    onChange={(e) => updateListenLocator(idx, e.target.value)}
                    placeholder="tcp/0.0.0.0:7447 or ws/0.0.0.0:8080"
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
