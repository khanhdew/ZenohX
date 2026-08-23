import React from 'react';
import { Lock, Globe, Zap, Radio, Shield, ShieldCheck } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { type CloudProtocol, SUPPORTED_CLOUD_PROTOCOLS } from '../../../lib/tls';

export interface CloudConfigFormProps {
  cloudName: string;
  setCloudName: (val: string) => void;
  cloudHost: string;
  setCloudHost: (val: string) => void;
  cloudPort: string;
  setCloudPort: (val: string) => void;
  cloudProtocol: CloudProtocol;
  setCloudProtocol: (val: CloudProtocol) => void;
  tlsOnly?: boolean;
  setTlsOnly?: (val: boolean) => void;
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
}

export const CloudConfigForm: React.FC<CloudConfigFormProps> = ({
  cloudName,
  setCloudName,
  cloudHost,
  setCloudHost,
  cloudPort,
  setCloudPort,
  cloudProtocol,
  setCloudProtocol,
  tlsOnly = false,
  setTlsOnly,
  username,
  setUsername,
  password,
  setPassword,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="cloud-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="cloud-name"
          value={cloudName}
          onChange={(e) => setCloudName(e.target.value)}
          placeholder="e.g. AWS Production Router"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* Server Address & Port */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">
          Router Address <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={cloudHost}
              onChange={(e) => setCloudHost(e.target.value)}
              placeholder="router.zenoh.io or 203.0.113.50"
              className="h-8 text-xs font-mono bg-background"
            />
          </div>
          <div className="w-24">
            <Input
              value={cloudPort}
              onChange={(e) => setCloudPort(e.target.value)}
              placeholder="7447"
              className="h-8 text-xs font-mono bg-background text-center"
            />
          </div>
        </div>
      </div>

      {/* Security / Protocol */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Transport Protocol</Label>
        <div className="grid grid-cols-4 gap-2">
          {SUPPORTED_CLOUD_PROTOCOLS.map((p) => {
            const Icon =
              p.id === 'tcp'
                ? Globe
                : p.id === 'tls'
                  ? Lock
                  : p.id === 'quic'
                    ? Zap
                    : Radio;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setCloudProtocol(p.id)}
                className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  cloudProtocol === p.id
                    ? 'border-primary bg-primary/10 text-foreground font-semibold'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className="w-3 h-3" />
                {p.label}
              </button>
            );
          })}
        </div>
        {cloudProtocol === 'tls' && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-muted-foreground">
              ✓ Verified automatically against standard system root certificates.
            </p>
            {setTlsOnly && (
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Strict TLS-Only Mode
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Only establish encrypted TLS links; refuse unencrypted fallback.
                  </p>
                </div>
                <Switch
                  checked={tlsOnly}
                  onCheckedChange={setTlsOnly}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optional Authentication Card */}
      <div className="space-y-2.5 border rounded-lg p-3 bg-muted/10">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
          Router Authentication (Optional)
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="zenoh_user"
              className="h-7 text-xs bg-background"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-7 text-xs bg-background"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
