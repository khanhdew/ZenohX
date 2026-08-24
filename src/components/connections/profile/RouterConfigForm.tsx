import React from 'react';
import {
  Server,
  Globe,
  Lock,
  Zap,
  Radio,
  Plus,
  Trash2,
  Shuffle,
  RadioTower,
  HelpCircle,
} from 'lucide-react';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { type CloudProtocol, SUPPORTED_CLOUD_PROTOCOLS, getRandomRouterPort } from '../../../lib/tls';

export interface RouterListenEndpoint {
  id: string;
  protocol: CloudProtocol;
  host: string;
  port: string;
}

export interface RouterConfigFormProps {
  routerName: string;
  setRouterName: (val: string) => void;
  listenEndpoints: RouterListenEndpoint[];
  addListenEndpoint: () => void;
  updateListenEndpoint: (id: string, updates: Partial<RouterListenEndpoint>) => void;
  removeListenEndpoint: (id: string) => void;
  routerScoutMulticast: boolean;
  setRouterScoutMulticast: (val: boolean) => void;
  routerConnectLocators: string[];
  addRouterConnectLocator: () => void;
  updateRouterConnectLocator: (index: number, val: string) => void;
  removeRouterConnectLocator: (index: number) => void;
}

export const RouterConfigForm: React.FC<RouterConfigFormProps> = ({
  routerName,
  setRouterName,
  listenEndpoints,
  addListenEndpoint,
  updateListenEndpoint,
  removeListenEndpoint,
  routerScoutMulticast,
  setRouterScoutMulticast,
  routerConnectLocators,
  addRouterConnectLocator,
  updateRouterConnectLocator,
  removeRouterConnectLocator,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Profile Name */}
      <div className="space-y-1">
        <Label htmlFor="router-name" className="text-xs font-semibold">
          Profile Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="router-name"
          value={routerName}
          onChange={(e) => setRouterName(e.target.value)}
          placeholder="e.g. Local Edge Router"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* Customizable Listen Endpoints Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-500" />
              Listen Endpoints ({listenEndpoints.length})
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Bind ports for incoming connections (e.g. TCP + TLS, or custom ports).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addListenEndpoint}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Endpoint</span>
          </Button>
        </div>

        <div className="space-y-2">
          {listenEndpoints.map((ep, idx) => (
            <div
              key={ep.id}
              className="p-3 rounded-lg border bg-card/60 space-y-2.5 relative group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Endpoint #{idx + 1}
                </span>
                {listenEndpoints.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    onClick={() => removeListenEndpoint(ep.id)}
                    className="h-6 w-6 text-destructive hover:bg-destructive/10"
                    title="Remove endpoint"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>

              {/* Protocol selector pills */}
              <div className="grid grid-cols-4 gap-1.5">
                {SUPPORTED_CLOUD_PROTOCOLS.map((p) => {
                  const Icon =
                    p.id === 'tcp'
                      ? Globe
                      : p.id === 'tls'
                        ? Lock
                        : p.id === 'quic'
                          ? Zap
                          : Radio;
                  const isSelected = ep.protocol === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => updateListenEndpoint(ep.id, { protocol: p.id })}
                      className={`h-7 px-1.5 rounded-md border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border bg-background hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{p.id.toUpperCase()}</span>
                    </button>
                  );
                })}
              </div>

              {/* Host & Port inputs */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    value={ep.host}
                    onChange={(e) =>
                      updateListenEndpoint(ep.id, { host: e.target.value })
                    }
                    placeholder="0.0.0.0"
                    className="h-8 text-xs font-mono bg-background"
                  />
                </div>
                <div className="w-28 relative flex items-center">
                  <Input
                    value={ep.port}
                    onChange={(e) =>
                      updateListenEndpoint(ep.id, { port: e.target.value })
                    }
                    placeholder="7447"
                    className="h-8 text-xs font-mono bg-background text-center pr-7"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateListenEndpoint(ep.id, { port: getRandomRouterPort() })
                    }
                    className="absolute right-1 text-muted-foreground hover:text-foreground p-1"
                    title="Generate random free port"
                  >
                    <Shuffle className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Quick Port helper pills */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[9px] text-muted-foreground">Quick Ports:</span>
                <button
                  type="button"
                  onClick={() => updateListenEndpoint(ep.id, { port: '7447' })}
                  className={`text-[9px] px-1.5 py-0.5 rounded border ${
                    ep.port === '7447'
                      ? 'border-primary text-primary bg-primary/5 font-semibold'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  7447 (Default)
                </button>
                <button
                  type="button"
                  onClick={() => updateListenEndpoint(ep.id, { port: '7446' })}
                  className={`text-[9px] px-1.5 py-0.5 rounded border ${
                    ep.port === '7446'
                      ? 'border-primary text-primary bg-primary/5 font-semibold'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  7446 (TLS)
                </button>
                <button
                  type="button"
                  onClick={() => updateListenEndpoint(ep.id, { port: '0' })}
                  className={`text-[9px] px-1.5 py-0.5 rounded border ${
                    ep.port === '0'
                      ? 'border-primary text-primary bg-primary/5 font-semibold'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  0 (Auto Dynamic)
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multicast Discovery Responder Card */}
      <div className="rounded-lg border p-3 bg-muted/10 space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <RadioTower className="w-3.5 h-3.5 text-indigo-500" />
              Multicast Discovery Responder
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Answer LAN scout probes (<code className="font-mono text-[10px]">224.0.0.224:7446</code>) so clients and peers can auto-discover this router.
            </p>
          </div>
          <Switch
            checked={routerScoutMulticast}
            onCheckedChange={setRouterScoutMulticast}
          />
        </div>
      </div>

      {/* Optional Upstream Router Connect Locators */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold">
              Upstream Routers (Optional)
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Connect this router to upstream cloud/edge routers for multi-router routing.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRouterConnectLocator}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Upstream</span>
          </Button>
        </div>

        {routerConnectLocators.length === 0 ? (
          <div className="p-2.5 rounded-md bg-muted/20 border border-dashed text-[11px] text-muted-foreground text-center">
            Operating as standalone root router (no upstream router links).
          </div>
        ) : (
          <div className="space-y-1.5">
            {routerConnectLocators.map((loc, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={loc}
                  onChange={(e) => updateRouterConnectLocator(idx, e.target.value)}
                  placeholder="tcp/cloud.router.zenoh.io:7447"
                  className="h-8 text-xs font-mono bg-background flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => removeRouterConnectLocator(idx)}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                  title="Remove upstream locator"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
