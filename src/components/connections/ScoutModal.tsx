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

import React, { useState, useEffect } from 'react';
import {
  Radar,
  RefreshCw,
  Wifi,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionProfile, ScoutedNode } from '../../types/zenoh';
import {
  buildProfileFromScoutedNode,
  getLocatorProtocol,
  getPreferredLocator,
  resolveTlsConfig,
  isTlsEnabled,
} from '../../lib/tls';
import { findMatchingProfile } from '../../lib/topology/topologyBuilder';
import { ScoutFilters } from './scout/ScoutFilters';
import { ScoutNodeCard, type NodeTlsState } from './scout/ScoutNodeCard';

export interface ScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseAsProfile?: (node: ScoutedNode) => void;
  onOpenProfileEditor?: (profile: ConnectionProfile) => void;
}

export const ScoutModal: React.FC<ScoutModalProps> = ({
  isOpen,
  onClose,
  onUseAsProfile,
  onOpenProfileEditor,
}) => {
  const scoutedNodes = useConnectionStore((state) => state.scoutedNodes);
  const isScouting = useConnectionStore((state) => state.isScouting);
  const scout = useConnectionStore((state) => state.scout);
  const saveProfile = useConnectionStore((state) => state.saveProfile);
  const connectSession = useConnectionStore((state) => state.connect);
  const profiles = useConnectionStore((state) => state.profiles);

  const [timeoutMs, setTimeoutMs] = useState<number>(3000);
  const [protocolFilter, setProtocolFilter] = useState<'all' | 'tls' | 'plain'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [actionLoadingZid, setActionLoadingZid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-node local TLS and locator configuration
  const [nodeStates, setNodeStates] = useState<Record<string, NodeTlsState>>({});

  // Trigger scout on initial open if modal becomes active
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      handleScout();
    }
  }, [isOpen]);

  const handleScout = async () => {
    setErrorMsg(null);
    try {
      await scout(timeoutMs);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    });
  };

  // Get or initialize state for a scouted node
  const getNodeState = (node: ScoutedNode): NodeTlsState => {
    if (nodeStates[node.zid]) {
      return nodeStates[node.zid];
    }
    const defaultLocator = getPreferredLocator(node.locators || []) || '';
    const isTls = getLocatorProtocol(defaultLocator) === 'tls';
    return {
      selectedLocator: defaultLocator,
      enableTls: isTls,
      useCustomTls: false,
      caCert: '',
      clientCert: '',
      clientKey: '',
      showTlsOptions: false,
    };
  };

  const updateNodeState = (zid: string, patch: Partial<NodeTlsState>) => {
    setNodeStates((prev) => {
      const current = prev[zid] || {
        selectedLocator: '',
        enableTls: false,
        useCustomTls: false,
        caCert: '',
        clientCert: '',
        clientKey: '',
        showTlsOptions: false,
      };
      return {
        ...prev,
        [zid]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const buildProfile = (node: ScoutedNode): ConnectionProfile => {
    const state = getNodeState(node);
    const customTlsConfig = resolveTlsConfig({
      enableTls: state.enableTls,
      useCustomTls: state.useCustomTls,
      caCert: state.caCert,
      clientCert: state.clientCert,
      clientKey: state.clientKey,
    });

    return buildProfileFromScoutedNode(node, {
      selectedLocator: state.selectedLocator || undefined,
      enableTls: state.enableTls,
      customTls: customTlsConfig,
    });
  };

  const handleCreateProfile = async (node: ScoutedNode) => {
    setActionLoadingZid(node.zid);
    try {
      const state = getNodeState(node);
      const chosenLocator = state.selectedLocator || getPreferredLocator(node.locators || []);
      const existing = findMatchingProfile(profiles, node);
      if (existing) {
        if (chosenLocator && !existing.connect_locators.includes(chosenLocator)) {
          const updatedProfile: ConnectionProfile = {
            ...existing,
            connect_locators: [chosenLocator],
            updated_at: Date.now(),
          };
          await saveProfile(updatedProfile);
        }
        if (onUseAsProfile) {
          onUseAsProfile(node);
        }
        setActionLoadingZid(null);
        onClose();
        return;
      }

      const newProfile = buildProfile(node);
      await saveProfile(newProfile);

      if (onUseAsProfile) {
        onUseAsProfile(node);
      }

      setActionLoadingZid(null);
      onClose();
    } catch (err) {
      setActionLoadingZid(null);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenInEditor = (node: ScoutedNode) => {
    const existing = findMatchingProfile(profiles, node);
    if (existing) {
      if (onOpenProfileEditor) {
        onOpenProfileEditor(existing);
      }
      onClose();
      return;
    }

    const newProfile = buildProfile(node);
    if (onOpenProfileEditor) {
      onOpenProfileEditor(newProfile);
    }
    onClose();
  };

  const handleConnectDirectly = async (node: ScoutedNode) => {
    setActionLoadingZid(node.zid);
    try {
      const state = getNodeState(node);
      const chosenLocator = state.selectedLocator || getPreferredLocator(node.locators || []);
      const customTlsConfig = resolveTlsConfig({
        enableTls: state.enableTls,
        useCustomTls: state.useCustomTls,
        caCert: state.caCert,
        clientCert: state.clientCert,
        clientKey: state.clientKey,
      });

      const existing = findMatchingProfile(profiles, node);
      if (existing) {
        const needsUpdate =
          (chosenLocator && !existing.connect_locators.includes(chosenLocator)) ||
          Boolean(state.enableTls) !== isTlsEnabled(existing.tls_config, existing.connect_locators);

        if (needsUpdate) {
          const updatedProfile: ConnectionProfile = {
            ...existing,
            connect_locators: chosenLocator ? [chosenLocator] : existing.connect_locators,
            tls_config: customTlsConfig,
            updated_at: Date.now(),
          };
          await saveProfile(updatedProfile);
          await connectSession(updatedProfile.id);
        } else {
          await connectSession(existing.id);
        }

        setActionLoadingZid(null);
        onClose();
        return;
      }

      const newProfile = buildProfile(node);
      const isNew = !profiles.some((p) => p.id === newProfile.id);
      try {
        await saveProfile(newProfile);
        await connectSession(newProfile.id);
      } catch (connectErr) {
        if (isNew) {
          await useConnectionStore.getState().deleteProfile(newProfile.id).catch(() => {});
        }
        throw connectErr;
      }

      setActionLoadingZid(null);
      onClose();
    } catch (err) {
      setActionLoadingZid(null);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  // Filter nodes based on search query and protocol filter
  const filteredNodes = scoutedNodes.filter((node) => {
    const matchesSearch =
      !searchQuery.trim() ||
      node.zid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (node.locators && node.locators.some((l) => l.toLowerCase().includes(searchQuery.toLowerCase())));

    if (!matchesSearch) return false;

    if (protocolFilter === 'tls') {
      return node.locators && node.locators.some((l) => getLocatorProtocol(l) === 'tls');
    }
    if (protocolFilter === 'plain') {
      return !node.locators || !node.locators.some((l) => getLocatorProtocol(l) === 'tls');
    }

    return true;
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-md bg-muted text-muted-foreground">
                <Radar className={`w-4 h-4 ${isScouting ? 'animate-spin text-primary' : ''}`} />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  LAN Multicast Scout
                  {isScouting && (
                    <Badge variant="secondary" className="text-[10px] animate-pulse font-normal">
                      Scanning...
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Listen for Zenoh peers and routers announcing on UDP multicast (<code className="font-mono text-[10px]">224.0.0.224:7446</code>).
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs uppercase font-mono">
              Zenoh 1.10.0
            </Badge>
          </div>
        </DialogHeader>

        {/* Toolbar & Filter Bar */}
        <ScoutFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          protocolFilter={protocolFilter}
          setProtocolFilter={setProtocolFilter}
          totalNodeCount={scoutedNodes.length}
          timeoutMs={timeoutMs}
          setTimeoutMs={setTimeoutMs}
          isScouting={isScouting}
          onScout={handleScout}
        />

        {/* Error message */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* Scouted Nodes List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 mt-4 border border-dashed rounded-md bg-muted/10">
              <div className="p-3 rounded-full bg-muted text-muted-foreground">
                <Wifi className={`w-6 h-6 ${isScouting ? 'animate-pulse' : 'opacity-40'}`} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold">
                  {isScouting
                    ? 'Scanning local subnet for Zenoh nodes...'
                    : scoutedNodes.length > 0
                    ? 'No matching nodes found for current filter'
                    : 'No Zenoh Nodes Discovered'}
                </h4>
                <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
                  {isScouting
                    ? 'Listening for UDP multicast heartbeat packets on 224.0.0.224:7446.'
                    : scoutedNodes.length > 0
                    ? 'Try adjusting your protocol or text search filter above.'
                    : 'No Zenoh peers or routers responded. Ensure target nodes have multicast scouting enabled or add locators manually.'}
                </p>
              </div>
              {!isScouting && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScout}
                  className="h-7 text-xs gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Scan
                </Button>
              )}
            </div>
          ) : (
            filteredNodes.map((node, index) => {
              const isLoading = actionLoadingZid === node.zid;
              const nodeState = getNodeState(node);
              const matchingProfile = findMatchingProfile(profiles, node);

              return (
                <ScoutNodeCard
                  key={`${node.zid}-${index}`}
                  node={node}
                  nodeState={nodeState}
                  updateNodeState={(patch) => updateNodeState(node.zid, patch)}
                  isLoading={isLoading}
                  copiedText={copiedText}
                  onCopy={handleCopy}
                  onOpenInEditor={handleOpenInEditor}
                  onCreateProfile={handleCreateProfile}
                  onConnectDirectly={handleConnectDirectly}
                  isAlreadySaved={Boolean(matchingProfile)}
                  savedProfileName={matchingProfile?.name}
                />
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 border-t bg-muted/20 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Scouting uses multicast UDP group 224.0.0.224 on port 7446.
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScoutModal;
