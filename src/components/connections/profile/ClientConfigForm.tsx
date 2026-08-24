import React from 'react';
import { Lock, Globe, Zap, Radio, Shield, ShieldCheck } from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { type TransportProtocol, SUPPORTED_TRANSPORT_PROTOCOLS } from '../../../lib/tls';

export interface ClientConfigFormProps {
  clientName: string;
  setClientName: (val: string) => void;
  clientHost: string;
  setClientHost: (val: string) => void;
  clientPort: string;
  setClientPort: (val: string) => void;
  clientProtocol: TransportProtocol;
  setClientProtocol: (val: TransportProtocol) => void;
  tlsOnly?: boolean;
  setTlsOnly?: (val: boolean) => void;
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
}

export const ClientConfigForm: React.FC<ClientConfigFormProps> = ({
  clientName,
  setClientName,
  clientHost,
  setClientHost,
  clientPort,
  setClientPort,
  clientProtocol,
  setClientProtocol,
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

      {/* Router Address & Port */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">
          Upstream Router Address <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={clientHost}
              onChange={(e) => setClientHost(e.target.value)}
              placeholder="127.0.0.1 or router.zenoh.io"
              className="h-8 text-xs font-mono bg-background"
            />
          </div>
          <div className="w-24">
            <Input
              value={clientPort}
              onChange={(e) => setClientPort(e.target.value)}
              placeholder="7447"
              className="h-8 text-xs font-mono bg-background text-center"
            />
          </div>
        </div>
        {/* Quick address suggestions */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[9px] text-muted-foreground">Quick Fill:</span>
          <button
            type="button"
            onClick={() => {
              setClientHost('127.0.0.1');
              setClientPort('7447');
            }}
            className={`text-[9px] px-1.5 py-0.5 rounded border ${
              clientHost === '127.0.0.1'
                ? 'border-primary text-primary bg-primary/5 font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            127.0.0.1 (Localhost)
          </button>
          <button
            type="button"
            onClick={() => {
              setClientHost('demo.zenoh.io');
              setClientPort('7447');
            }}
            className={`text-[9px] px-1.5 py-0.5 rounded border ${
              clientHost === 'demo.zenoh.io'
                ? 'border-primary text-primary bg-primary/5 font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            demo.zenoh.io (Public)
          </button>
        </div>
      </div>

      {/* Security / Protocol */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Transport Protocol</Label>
        <div className="grid grid-cols-4 gap-2">
          {SUPPORTED_TRANSPORT_PROTOCOLS.map((p) => {
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
                onClick={() => setClientProtocol(p.id)}
                className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  clientProtocol === p.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{p.id.toUpperCase()}</span>
              </button>
            );
          })}
        </div>

        {clientProtocol === 'tls' && (
          <div className="mt-3 p-3 rounded-lg border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Strict TLS-Only Mode
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Refuse unencrypted fallback connections; enforce TLS transport.
                </p>
              </div>
              {setTlsOnly && (
                <Switch checked={tlsOnly} onCheckedChange={setTlsOnly} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* User Authentication */}
      <div className="space-y-2 pt-2 border-t">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
          User Authentication (Optional)
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
