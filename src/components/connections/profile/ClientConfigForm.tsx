import React from 'react';
import {
  Lock,
  Globe,
  Zap,
  Wifi,
  ShieldCheck,
  HardDrive,
  Shield,
  RefreshCw,
} from 'lucide-react';
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
  enableReconnectRetry?: boolean;
  setEnableReconnectRetry?: (val: boolean) => void;
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
  clientHost,
  setClientHost,
  clientPort,
  setClientPort,
  clientProtocol,
  setClientProtocol,
  tlsOnly = false,
  setTlsOnly,
  enableReconnectRetry = true,
  setEnableReconnectRetry,
  username,
  setUsername,
  password,
  setPassword,
}) => {
  const isUnix = clientProtocol === 'unix';

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

      {/* Transport Protocol Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Transport Protocol</Label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {CLIENT_PROTOCOLS.map((p) => {
            const Icon = getProtocolIcon(p.id);
            const isSelected = clientProtocol === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setClientProtocol(p.id);
                  if (p.id === 'unix' && (!clientHost || clientHost === '127.0.0.1')) {
                    setClientHost('/tmp/zenoh.sock');
                    setClientPort('');
                  } else if (p.id !== 'unix') {
                    if (clientHost.startsWith('/') || !clientHost) {
                      setClientHost('127.0.0.1');
                    }
                    if (!clientPort || isUnix) {
                      setClientPort(p.defaultPort || '7447');
                    }
                  }
                }}
                className={`h-8 px-2 rounded-md border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{p.id.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upstream Router Address / Socket */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">
          {isUnix ? 'Unix Domain Socket Path' : 'Upstream Router Address'}{' '}
          <span className="text-destructive">*</span>
        </Label>

        {isUnix ? (
          <div className="space-y-1.5">
            <Input
              value={clientHost}
              onChange={(e) => setClientHost(e.target.value)}
              placeholder="/tmp/zenoh.sock"
              className="h-8 text-xs font-mono bg-background"
            />
            {/* Quick Unix Path suggestions */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[9px] text-muted-foreground">Quick Fill:</span>
              <button
                type="button"
                onClick={() => setClientHost('/tmp/zenoh.sock')}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  clientHost === '/tmp/zenoh.sock'
                    ? 'border-primary text-primary bg-primary/5 font-semibold'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                /tmp/zenoh.sock
              </button>
              <button
                type="button"
                onClick={() => setClientHost('/var/run/zenoh.sock')}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  clientHost === '/var/run/zenoh.sock'
                    ? 'border-primary text-primary bg-primary/5 font-semibold'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                /var/run/zenoh.sock
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
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
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[9px] text-muted-foreground">Quick Fill:</span>
              <button
                type="button"
                onClick={() => {
                  setClientHost('127.0.0.1');
                  setClientPort('7447');
                  setClientProtocol('tcp');
                }}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  clientHost === '127.0.0.1' && clientPort === '7447' && clientProtocol === 'tcp'
                    ? 'border-primary text-primary bg-primary/5 font-semibold'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                127.0.0.1:7447
              </button>
              <button
                type="button"
                onClick={() => {
                  setClientHost('127.0.0.1');
                  setClientPort('8080');
                  setClientProtocol('ws');
                }}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  clientHost === '127.0.0.1' && clientPort === '8080' && clientProtocol === 'ws'
                    ? 'border-primary text-primary bg-primary/5 font-semibold'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                127.0.0.1:8080 (WS)
              </button>
              <button
                type="button"
                onClick={() => {
                  setClientHost('demo.zenoh.io');
                  setClientPort('7447');
                  setClientProtocol('tcp');
                }}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  clientHost === 'demo.zenoh.io' && clientPort === '7447'
                    ? 'border-primary text-primary bg-primary/5 font-semibold'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                demo.zenoh.io:7447
              </button>
            </div>
          </div>
        )}

        {(clientProtocol === 'tls' || clientProtocol === 'wss') && (
          <div className="mt-3 p-3 rounded-lg border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Strict TLS-Only Mode
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Refuse unencrypted fallback connections; enforce encrypted transport.
                </p>
              </div>
              {setTlsOnly && (
                <Switch checked={tlsOnly} onCheckedChange={setTlsOnly} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Exponential Reconnection Strategy */}
      {setEnableReconnectRetry && (
        <div className="rounded-lg border p-3 bg-muted/10 space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-sky-500" />
                Automatic Reconnection Retry
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Automatically attempt exponential backoff reconnection if the upstream link drops.
              </p>
            </div>
            <Switch
              checked={enableReconnectRetry}
              onCheckedChange={setEnableReconnectRetry}
            />
          </div>
        </div>
      )}

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
