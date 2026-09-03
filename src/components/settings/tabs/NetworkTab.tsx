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

import React, { useState, useEffect, useMemo } from 'react';
import {
  Radio,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Globe,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { SimpleTooltip } from '../../ui/tooltip';
import { useSettingsStore } from '../../../stores/settingsStore';

export interface NetworkTabProps {
  className?: string;
  isEmbedded?: boolean;
}

/**
 * Sanitizes and validates a hostname string.
 * Strips any trailing `.local` suffix and ensures RFC 1123 compliant characters (a-z, 0-9, hyphens).
 */
export function sanitizeHostname(input: string): string {
  let cleaned = input.trim().toLowerCase();
  if (cleaned.endsWith('.local')) {
    cleaned = cleaned.slice(0, -6);
  }
  return cleaned;
}

export function validateHostname(hostname: string): { isValid: boolean; error?: string } {
  if (!hostname) {
    return { isValid: false, error: 'Hostname cannot be empty' };
  }
  if (hostname.length > 63) {
    return { isValid: false, error: 'Hostname cannot exceed 63 characters' };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(hostname)) {
    return {
      isValid: false,
      error: 'Hostname must start and end with a letter/digit and contain only letters, numbers, and hyphens',
    };
  }
  return { isValid: true };
}

export const NetworkTab: React.FC<NetworkTabProps> = ({ className = '', isEmbedded = false }) => {
  const {
    mdnsEnabled,
    mdnsHostname,
    mdnsStatus,
    isMdnsLoading,
    mdnsError,
    updateMdnsConfig,
    refreshMdnsInterfaces,
    fetchMdnsStatus,
  } = useSettingsStore();

  const [hostnameInput, setHostnameInput] = useState(mdnsHostname || 'zenohx');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copiedLocator, setCopiedLocator] = useState(false);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync hostname input when store state updates
  useEffect(() => {
    if (mdnsHostname) {
      setHostnameInput(mdnsHostname);
    }
  }, [mdnsHostname]);

  // Fetch initial status on mount
  useEffect(() => {
    fetchMdnsStatus().catch(() => {});
  }, [fetchMdnsStatus]);

  const activeHostname =
    mdnsStatus?.active_hostname ||
    (mdnsHostname ? (mdnsHostname.endsWith('.local') ? mdnsHostname : `${mdnsHostname}.local`) : 'zenohx.local');

  const defaultLocator = `tcp/${activeHostname}:7447`;
  const boundAddresses = useMemo(() => {
    const raw = mdnsStatus?.addresses || mdnsStatus?.bound_ips || ['127.0.0.1'];
    return Array.from(new Set(raw));
  }, [mdnsStatus?.addresses, mdnsStatus?.bound_ips]);
  const isConflict = Boolean(mdnsStatus?.is_conflict);
  const isRunning = mdnsEnabled && (mdnsStatus?.running !== false);

  const handleHostnameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHostnameInput(val);
    setSaveSuccess(false);

    const sanitized = sanitizeHostname(val);
    const { isValid, error } = validateHostname(sanitized);
    if (!isValid) {
      setValidationError(error || 'Invalid hostname');
    } else {
      setValidationError(null);
    }
  };

  const handleSaveHostname = async () => {
    const sanitized = sanitizeHostname(hostnameInput);
    const { isValid, error } = validateHostname(sanitized);
    if (!isValid) {
      setValidationError(error || 'Invalid hostname');
      return;
    }

    setValidationError(null);
    try {
      await updateMdnsConfig(mdnsEnabled, sanitized);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error handled by store
    }
  };

  const handleToggleMdns = async (enabled: boolean) => {
    const sanitized = sanitizeHostname(hostnameInput);
    try {
      await updateMdnsConfig(enabled, sanitized || 'zenohx');
    } catch {
      // Error handled by store
    }
  };

  const handleResetHostname = () => {
    setHostnameInput('zenohx');
    setValidationError(null);
  };

  const handleCopyLocator = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(defaultLocator);
    }
    setCopiedLocator(true);
    setTimeout(() => setCopiedLocator(false), 2000);
  };

  const handleCopyIp = (ip: string) => {
    const loc = `tcp/${ip}:7447`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(loc);
    }
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  return (
    <div className={`max-w-3xl mx-auto ${isEmbedded ? 'space-y-6 pt-2' : 'p-6 space-y-8'} ${className}`}>
      {/* Header */}
      {!isEmbedded && (
        <div>
          <h3
            className="text-sm font-semibold text-foreground flex items-center gap-2 cursor-help"
            title="Configure the local mDNS responder (.local) for zero-configuration discovery across your local network."
          >
            <Radio className="w-4 h-4" />
            Network & Local Discovery (mDNS)
          </h3>
        </div>
      )}

      {/* IPC / Runtime Error Banner */}
      {mdnsError && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{mdnsError}</span>
        </div>
      )}

      {/* Main Settings Card */}
      <section className="space-y-4">
        {isEmbedded && (
          <div>
            <h3
              className="text-sm font-semibold text-foreground flex items-center gap-2 cursor-help"
              title="Advertise your Zenoh router on the local LAN without static IP configuration."
            >
              <Radio className="w-4 h-4" />
              Network & Local Discovery (mDNS)
            </h3>
          </div>
        )}

        <div className="rounded-xl border bg-card divide-y shadow-xs">
          {/* Toggle: Enable mDNS Responder */}
          <div className="p-4 flex items-center justify-between gap-4">
            <label
              className="text-xs font-medium text-foreground block cursor-help"
              title="Broadcast Multicast DNS records across all active network adapters. Local peers and clients can connect directly to this node."
            >
              Enable mDNS Responder
            </label>
            <Switch
              checked={mdnsEnabled}
              onCheckedChange={handleToggleMdns}
              disabled={isMdnsLoading}
            />
          </div>

          {/* Advertised Hostname Input & Actions */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="mdns-hostname-input"
                className="text-xs font-medium text-foreground block cursor-help"
                title="Base hostname advertised on the local network (resolves with .local suffix)."
              >
                Advertised Hostname
              </label>
              <SimpleTooltip content="Reset hostname to 'zenohx'">
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={handleResetHostname}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </SimpleTooltip>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="mdns-hostname-input"
                  value={hostnameInput}
                  onChange={handleHostnameChange}
                  placeholder="zenohx"
                  disabled={isMdnsLoading}
                  className={`h-8 text-xs font-mono pr-16 bg-background ${
                    validationError ? 'border-destructive focus-visible:ring-destructive' : ''
                  }`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground pointer-events-none select-none">
                  .local
                </span>
              </div>

              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSaveHostname}
                disabled={
                  isMdnsLoading ||
                  Boolean(validationError) ||
                  sanitizeHostname(hostnameInput) === mdnsHostname
                }
                className="h-8 text-xs font-medium gap-1.5 shrink-0"
              >
                {isMdnsLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-3.5 h-3.5 text-primary" />
                ) : null}
                <span>{saveSuccess ? 'Saved' : 'Save mDNS Settings'}</span>
              </Button>
            </div>

            {/* Hostname Validation Message */}
            {validationError && (
              <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Live Responder Status & Network Interfaces Card */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3
            className="text-sm font-semibold text-foreground flex items-center gap-2 cursor-help"
            title="Current runtime status, advertised locators, and detected LAN IP interfaces."
          >
            <Globe className="w-4 h-4" />
            Live Responder Status & Interfaces
          </h3>

          {/* Refresh Interfaces Action */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refreshMdnsInterfaces()}
            disabled={isMdnsLoading}
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            title="Scan and refresh local network interfaces"
          >
            <RefreshCw className={`w-3 h-3 ${isMdnsLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Network Interfaces</span>
          </Button>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
          {/* Status Badge & Collision Alert */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">Service Status:</span>
              {isRunning ? (
                isConflict ? (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-medium gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Conflict Resolved ({activeHostname})
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-medium gap-1 bg-primary/10 text-primary border-primary/20"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Active as {activeHostname}
                  </Badge>
                )
              ) : (
                <Badge
                  variant="secondary"
                  className="text-[11px] font-medium gap-1 text-muted-foreground"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  Inactive / Disabled
                </Badge>
              )}
            </div>

            {/* Conflict Warning Note */}
            {isConflict && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Another node claimed the default name; responder auto-renamed to <strong>{activeHostname}</strong>.</span>
              </div>
            )}
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Advertised Hostname Card */}
            <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                Advertised Name
              </span>
              <span className="text-xs font-mono font-medium text-foreground block truncate">
                {activeHostname}
              </span>
            </div>

            {/* Advertised Port Card */}
            <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                Advertised Port
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-foreground block">
                  {mdnsStatus?.port || 7447}
                </span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  TCP / Zenoh Default
                </Badge>
              </div>
            </div>
          </div>

          {/* Quick Copy Default Locator */}
          <div className="p-3 rounded-lg border bg-muted/20 flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                Default Locator
              </span>
              <span className="text-xs font-mono font-medium text-foreground block truncate">
                {defaultLocator}
              </span>
            </div>
            <Button
              type="button"
              variant={copiedLocator ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleCopyLocator}
              className={`h-7 px-2 text-xs font-mono gap-1.5 shrink-0 transition-colors ${
                copiedLocator ? 'bg-primary/10 text-primary border-primary/30' : ''
              }`}
            >
              {copiedLocator ? (
                <>
                  <Check className="w-3 h-3 text-primary" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Locator</span>
                </>
              )}
            </Button>
          </div>

          {/* Detected Network IP Addresses List */}
          <div className="space-y-2 pt-1">
            <span
              className="text-xs font-medium text-foreground block cursor-help"
              title="Click any IP to copy locator"
            >
              Bound IP Addresses ({boundAddresses.length})
            </span>

            {boundAddresses.length === 0 ? (
              <div className="p-3 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                No active network interfaces detected.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {boundAddresses.map((ip) => {
                  const isIpv6 = ip.includes(':');
                  const isCopied = copiedIp === ip;

                  return (
                    <button
                      key={ip}
                      type="button"
                      onClick={() => handleCopyIp(ip)}
                      title={`Click to copy tcp/${ip}:7447`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors ${
                        isCopied
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border bg-background hover:bg-muted/60 text-foreground'
                      }`}
                    >
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1 py-0 h-3.5 font-sans font-semibold"
                      >
                        {isIpv6 ? 'IPv6' : 'IPv4'}
                      </Badge>
                      <span>{ip}</span>
                      {isCopied ? (
                        <Check className="w-3 h-3 text-primary ml-0.5 shrink-0" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 text-muted-foreground/50 ml-0.5 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default NetworkTab;
