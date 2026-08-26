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

import { create } from 'zustand';
import { generateZenohJson5 } from '../lib/tls';
import type { TopologyNode } from '../types/topology';
import type { ConnectionProfile, SessionConfig, SessionInfo } from '../types/zenoh';

export interface ConnectionJsonState {
  /** Currently selected / inspected node ZID */
  selectedNodeZid: string | null;
  /** Currently edited profile ID */
  selectedProfileId: string | null;
  /** Synchronized JSON5 configuration for the currently inspected Node */
  activeNodeJson: string;
  /** Synchronized JSON5 configuration for the active Edit Connection form */
  activeEditFormJson: string;
  /** Custom JSON overrides mapped by profile ID */
  customOverrides: Record<string, string>;

  /** Syncs and computes live JSON5 configuration from an inspected TopologyNode */
  syncNodeJson: (
    node: TopologyNode | null,
    matchingProfile?: ConnectionProfile | null,
    activeSession?: SessionInfo | null
  ) => string;

  /** Syncs and computes live JSON5 configuration from active form inputs / SessionConfig */
  syncEditFormJson: (
    config: Partial<SessionConfig> | Partial<ConnectionProfile> | Record<string, any>,
    activeSession?: SessionInfo | null
  ) => string;

  /** Sets custom raw JSON override for a given profile */
  setCustomOverride: (profileId: string, customJson: string) => void;

  /** Parses a Zenoh JSON / JSON5 configuration object back into a structured ConnectionProfile */
  parseJsonToProfile: (jsonString: string) => Partial<ConnectionProfile> | null;

  /** Resets active node and form JSON state */
  clearActive: () => void;
}

export const useConnectionJsonStore = create<ConnectionJsonState>((set) => ({
  selectedNodeZid: null,
  selectedProfileId: null,
  activeNodeJson: '',
  activeEditFormJson: '',
  customOverrides: {},

  syncNodeJson: (node, matchingProfile, activeSession) => {
    if (!node) {
      set({ selectedNodeZid: null, activeNodeJson: '' });
      return '';
    }

    const zid = node.zid || activeSession?.zid || matchingProfile?.id;
    const mode = (node.type || matchingProfile?.mode || activeSession?.mode || 'peer') as 'router' | 'peer' | 'client';

    const isClient = mode === 'client';

    const listenLocators = isClient
      ? []
      : (node.locators && node.locators.length > 0
        ? node.locators
        : activeSession?.bound_locators && activeSession.bound_locators.length > 0
        ? activeSession.bound_locators
        : matchingProfile?.listen_locators) || [];

    const connectLocators = isClient
      ? (node.connectLocators && node.connectLocators.length > 0
        ? node.connectLocators
        : matchingProfile?.connect_locators && matchingProfile.connect_locators.length > 0
        ? matchingProfile.connect_locators
        : node.locators) || []
      : (node.connectLocators && node.connectLocators.length > 0
        ? node.connectLocators
        : matchingProfile?.connect_locators) || [];

    const jsonStr = generateZenohJson5({
      id: zid,
      zid,
      mode,
      connect_locators: connectLocators,
      listen_locators: listenLocators,
      scout_multicast: matchingProfile?.scout_multicast ?? true,
      scout_gossip: matchingProfile?.scout_gossip ?? true,
      reconnect_retry: matchingProfile?.reconnect_retry,
      user_auth: matchingProfile?.user_auth,
      tls_config: matchingProfile?.tls_config,
      custom_config: matchingProfile?.custom_config,
    });

    set({
      selectedNodeZid: node.zid,
      activeNodeJson: jsonStr,
    });

    return jsonStr;
  },

  syncEditFormJson: (config, activeSession) => {
    const resolvedConfig = { ...config };
    const bound = activeSession?.bound_locators;
    if (bound && bound.length > 0) {
      const configuredLocs = Array.isArray(config.listen_locators) ? config.listen_locators : [];
      const hasWildcardOrZero = configuredLocs.some(
        (l) => typeof l === 'string' && (l.includes(':0') || l.includes('0.0.0.0') || l.includes('[::]'))
      );
      if (hasWildcardOrZero || configuredLocs.length === 0) {
        resolvedConfig.listen_locators = bound;
      }
    }
    const jsonStr = generateZenohJson5(resolvedConfig);
    set({
      selectedProfileId: (config as any)?.profile_id || (config as any)?.id || null,
      activeEditFormJson: jsonStr,
    });
    return jsonStr;
  },

  setCustomOverride: (profileId, customJson) => {
    set((state) => ({
      customOverrides: {
        ...state.customOverrides,
        [profileId]: customJson,
      },
    }));
  },

  parseJsonToProfile: (jsonString: string) => {
    if (!jsonString || !jsonString.trim()) return null;
    try {
      // Strip comments and trailing commas to support JSON5 input
      const cleaned = jsonString
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
        .replace(/,\s*([}\]])/g, '$1')
        .trim();

      const parsed = JSON.parse(cleaned);
      const mode = (parsed.mode || 'peer').toLowerCase() as 'router' | 'peer' | 'client';

      let connectLocs: string[] = [];
      if (Array.isArray(parsed.connect?.endpoints)) {
        connectLocs = parsed.connect.endpoints.filter((l: any) => typeof l === 'string' && l.trim());
      } else if (typeof parsed.connect?.endpoints === 'string' && parsed.connect.endpoints.trim()) {
        connectLocs = [parsed.connect.endpoints.trim()];
      } else if (Array.isArray(parsed.connect_locators)) {
        connectLocs = parsed.connect_locators.filter((l: any) => typeof l === 'string' && l.trim());
      }

      let listenLocs: string[] = [];
      if (Array.isArray(parsed.listen?.endpoints)) {
        listenLocs = parsed.listen.endpoints.filter((l: any) => typeof l === 'string' && l.trim());
      } else if (typeof parsed.listen?.endpoints === 'string' && parsed.listen.endpoints.trim()) {
        listenLocs = [parsed.listen.endpoints.trim()];
      } else if (Array.isArray(parsed.listen_locators)) {
        listenLocs = parsed.listen_locators.filter((l: any) => typeof l === 'string' && l.trim());
      }

      const scoutMulticast =
        typeof parsed.scouting?.multicast?.enabled === 'boolean'
          ? parsed.scouting.multicast.enabled
          : typeof parsed.scout_multicast === 'boolean'
          ? parsed.scout_multicast
          : mode !== 'client';

      const scoutGossip =
        typeof parsed.scouting?.gossip?.enabled === 'boolean'
          ? parsed.scouting.gossip.enabled
          : typeof parsed.scout_gossip === 'boolean'
          ? parsed.scout_gossip
          : mode !== 'client';

      let userAuth = null;
      if (parsed.transport?.auth?.usrpwd) {
        userAuth = {
          username: parsed.transport.auth.usrpwd.user,
          password: parsed.transport.auth.usrpwd.password,
        };
      } else if (parsed.user_auth) {
        userAuth = parsed.user_auth;
      }

      let tlsConfig = null;
      if (parsed.transport?.link?.tls) {
        const tls = parsed.transport.link.tls;
        tlsConfig = {
          ca_cert: tls.root_ca_certificate,
          client_cert: tls.connect_certificate || tls.listen_certificate,
          client_key: tls.connect_private_key || tls.listen_private_key,
        };
      } else if (parsed.tls_config) {
        tlsConfig = parsed.tls_config;
      }

      let reconnectRetry = null;
      if (parsed.connect?.retry) {
        reconnectRetry = {
          period_init_ms: parsed.connect.retry.period_init_ms ?? 1000,
          period_max_ms: parsed.connect.retry.period_max_ms ?? 10000,
          factor: parsed.connect.retry.period_increase_factor ?? 2,
          timeout_ms: parsed.connect.timeout_ms ?? 0,
        };
      } else if (parsed.reconnect_retry) {
        reconnectRetry = parsed.reconnect_retry;
      }

      return {
        id: parsed.id || parsed.zid,
        name: parsed.name,
        mode,
        connect_locators: connectLocs,
        listen_locators: listenLocs,
        scout_multicast: scoutMulticast,
        scout_gossip: scoutGossip,
        reconnect_retry: reconnectRetry,
        user_auth: userAuth,
        tls_config: tlsConfig,
        custom_config: parsed,
      };
    } catch (err) {
      console.warn('Failed to parse JSON into ConnectionProfile:', err);
      return null;
    }
  },

  clearActive: () => {
    set({
      selectedNodeZid: null,
      selectedProfileId: null,
      activeNodeJson: '',
      activeEditFormJson: '',
    });
  },
}));
