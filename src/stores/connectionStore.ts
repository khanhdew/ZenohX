/**
 * Connection Store (Zustand)
 * Manages Zenoh connection profiles, active sessions, LAN scout discovery, and connection statuses.
 */

import { create } from 'zustand';
import type {
  ConnectionProfile,
  ScoutedNode,
  SessionConfig,
  SessionInfo,
} from '../types/zenoh';
import {
  connectSession,
  deleteProfile as deleteProfileIpc,
  disconnectSession,
  getAllSessions,
  getSessionInfo,
  loadProfiles as loadProfilesIpc,
  saveProfile as saveProfileIpc,
  scoutNodes,
} from '../lib/tauri';

export interface ConnectionState {
  profiles: ConnectionProfile[];
  selectedProfileId: string | null;
  /** Maps profileId -> SessionInfo */
  activeSessions: Record<string, SessionInfo>;
  /** Maps sessionId -> profileId */
  sessionToProfile: Record<string, string>;
  /** Tracks profiles in the process of connecting */
  connectingProfileIds: Record<string, boolean>;
  scoutedNodes: ScoutedNode[];
  isScouting: boolean;
  isLoadingProfiles: boolean;
  error: string | null;

  // Actions
  loadProfiles: () => Promise<void>;
  selectProfile: (profileId: string | null) => void;
  saveProfile: (profile: ConnectionProfile) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  connect: (profileId: string) => Promise<string>;
  disconnect: (profileId: string) => Promise<void>;
  scout: (timeoutMs?: number) => Promise<ScoutedNode[]>;
  refreshSessions: () => Promise<void>;
  setError: (error: string | null) => void;

  // Helpers
  isConnected: (profileId: string) => boolean;
  getActiveSession: (profileId?: string) => SessionInfo | undefined;
  getActiveSessionId: (profileId?: string) => string | undefined;
  getSelectedProfile: () => ConnectionProfile | undefined;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles: [],
  selectedProfileId: null,
  activeSessions: {},
  sessionToProfile: {},
  connectingProfileIds: {},
  scoutedNodes: [],
  isScouting: false,
  isLoadingProfiles: false,
  error: null,

  loadProfiles: async () => {
    set({ isLoadingProfiles: true, error: null });
    try {
      const profiles = await loadProfilesIpc();
      set((state) => {
        let selectedId = state.selectedProfileId;
        if (!selectedId && profiles.length > 0) {
          selectedId = profiles[0].id;
        } else if (selectedId && !profiles.some((p) => p.id === selectedId)) {
          selectedId = profiles.length > 0 ? profiles[0].id : null;
        }
        return { profiles, selectedProfileId: selectedId, isLoadingProfiles: false };
      });
    } catch (err) {
      set({ error: String(err), isLoadingProfiles: false });
    }
  },

  selectProfile: (profileId: string | null) => {
    set({ selectedProfileId: profileId });
  },

  saveProfile: async (profile: ConnectionProfile) => {
    set({ error: null });
    try {
      await saveProfileIpc(profile);
      set((state) => {
        const index = state.profiles.findIndex((p) => p.id === profile.id);
        const newProfiles =
          index >= 0
            ? state.profiles.map((p) => (p.id === profile.id ? profile : p))
            : [...state.profiles, profile];
        return {
          profiles: newProfiles,
          selectedProfileId: state.selectedProfileId ?? profile.id,
        };
      });
    } catch (err) {
      const msg = `Failed to save profile: ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  deleteProfile: async (profileId: string) => {
    set({ error: null });
    try {
      // If currently connected, disconnect first
      if (get().isConnected(profileId)) {
        await get().disconnect(profileId);
      }

      await deleteProfileIpc(profileId);
      set((state) => {
        const newProfiles = state.profiles.filter((p) => p.id !== profileId);
        const newSelectedId =
          state.selectedProfileId === profileId
            ? newProfiles[0]?.id ?? null
            : state.selectedProfileId;
        return {
          profiles: newProfiles,
          selectedProfileId: newSelectedId,
        };
      });
    } catch (err) {
      const msg = `Failed to delete profile: ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  connect: async (profileId: string) => {
    const profile = get().profiles.find((p) => p.id === profileId);
    if (!profile) {
      const msg = `Profile with id '${profileId}' not found`;
      set({ error: msg });
      throw new Error(msg);
    }

    set((state) => ({
      connectingProfileIds: { ...state.connectingProfileIds, [profileId]: true },
      error: null,
    }));

    try {
      const config: SessionConfig = {
        mode: profile.mode,
        connect_locators: profile.connect_locators,
        listen_locators: profile.listen_locators,
        scout_multicast: profile.scout_multicast,
        user_auth: profile.user_auth,
        tls_config: profile.tls_config,
        custom_config: profile.custom_config,
      };

      const sessionId = await connectSession(config);
      const sessionInfo = await getSessionInfo(sessionId);

      set((state) => ({
        activeSessions: { ...state.activeSessions, [profileId]: sessionInfo },
        sessionToProfile: { ...state.sessionToProfile, [sessionId]: profileId },
        connectingProfileIds: { ...state.connectingProfileIds, [profileId]: false },
      }));

      return sessionId;
    } catch (err) {
      const msg = `Failed to connect session: ${err}`;
      set((state) => ({
        connectingProfileIds: { ...state.connectingProfileIds, [profileId]: false },
        error: msg,
      }));
      throw new Error(msg);
    }
  },

  disconnect: async (profileId: string) => {
    const sessionInfo = get().activeSessions[profileId];
    if (!sessionInfo) return;

    set({ error: null });
    try {
      await disconnectSession(sessionInfo.id);
      set((state) => {
        const nextActive = { ...state.activeSessions };
        delete nextActive[profileId];
        const nextSessionToProfile = { ...state.sessionToProfile };
        delete nextSessionToProfile[sessionInfo.id];
        return {
          activeSessions: nextActive,
          sessionToProfile: nextSessionToProfile,
        };
      });
    } catch (err) {
      const msg = `Failed to disconnect session: ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  scout: async (timeoutMs: number = 3000) => {
    set({ isScouting: true, error: null });
    try {
      const nodes = await scoutNodes(timeoutMs);
      set({ scoutedNodes: nodes, isScouting: false });
      return nodes;
    } catch (err) {
      const msg = `Failed to scout nodes: ${err}`;
      set({ error: msg, isScouting: false });
      throw new Error(msg);
    }
  },

  refreshSessions: async () => {
    try {
      const sessions = await getAllSessions();
      const currentMapping = get().sessionToProfile;
      const nextActive: Record<string, SessionInfo> = {};
      const nextSessionToProfile: Record<string, string> = {};

      for (const s of sessions) {
        const profileId = currentMapping[s.id];
        if (profileId) {
          nextActive[profileId] = s;
          nextSessionToProfile[s.id] = profileId;
        }
      }

      set({
        activeSessions: nextActive,
        sessionToProfile: nextSessionToProfile,
      });
    } catch (err) {
      set({ error: `Failed to refresh sessions: ${err}` });
    }
  },

  setError: (error: string | null) => set({ error }),

  isConnected: (profileId: string) => {
    return Boolean(get().activeSessions[profileId]);
  },

  getActiveSession: (profileId?: string) => {
    const targetId = profileId ?? get().selectedProfileId;
    return targetId ? get().activeSessions[targetId] : undefined;
  },

  getActiveSessionId: (profileId?: string) => {
    const targetId = profileId ?? get().selectedProfileId;
    return targetId ? get().activeSessions[targetId]?.id : undefined;
  },

  getSelectedProfile: () => {
    const selectedId = get().selectedProfileId;
    return get().profiles.find((p) => p.id === selectedId);
  },
}));
