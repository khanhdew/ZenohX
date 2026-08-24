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
  SessionStatusEvent,
} from '../types/zenoh';
import {
  connectSession,
  deleteProfile as deleteProfileIpc,
  disconnectSession,
  getAllSessions,
  getSessionInfo,
  loadProfiles as loadProfilesIpc,
  onSessionStatus,
  saveProfile as saveProfileIpc,
  scoutNodes,
} from '../lib/tauri';
import { formatFriendlyError } from '../lib/errorUtils';
import type { UnlistenFn } from '@tauri-apps/api/event';

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
  isListeningStatus: boolean;
  statusUnlistenFn: UnlistenFn | null;
  error: string | null;

  // Actions
  loadProfiles: () => Promise<void>;
  selectProfile: (profileId: string | null) => void;
  saveProfile: (profile: ConnectionProfile) => Promise<void>;
  saveAndConnect: (profile: ConnectionProfile) => Promise<string>;
  testConnection: (config: SessionConfig) => Promise<{ success: boolean; message: string }>;
  deleteProfile: (profileId: string) => Promise<void>;
  connect: (profileId: string) => Promise<string>;
  disconnect: (profileId: string) => Promise<void>;
  scout: (timeoutMs?: number) => Promise<ScoutedNode[]>;
  refreshSessions: () => Promise<void>;
  setError: (error: string | null) => void;
  handleSessionStatus: (status: SessionStatusEvent) => void;
  initStatusListener: () => Promise<void>;
  cleanupStatusListener: () => void;

  // Helpers
  isConnected: (profileId: string) => boolean;
  getActiveSession: (profileId?: string) => SessionInfo | undefined;
  getActiveSessionId: (profileId?: string) => string | undefined;
  getSelectedProfile: () => ConnectionProfile | undefined;
  getBoundLocators: (profileId?: string) => string[];
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
  isListeningStatus: false,
  statusUnlistenFn: null,
  error: null,

  loadProfiles: async () => {
    set({ isLoadingProfiles: true, error: null });
    try {
      const profiles = await loadProfilesIpc();
      set((state) => {
        let selectedId = state.selectedProfileId;
        const search =
          typeof window !== 'undefined' && window.location?.search ? window.location.search : '';
        const urlParams = search ? new URLSearchParams(search) : null;
        const queryProfileId = urlParams?.get('profileId');

        if (queryProfileId && profiles.some((p) => p.id === queryProfileId)) {
          selectedId = queryProfileId;
        } else if (!selectedId && profiles.length > 0) {
          selectedId = profiles[0].id;
        } else if (selectedId && !profiles.some((p) => p.id === selectedId)) {
          selectedId = profiles.length > 0 ? profiles[0].id : null;
        }
        return { profiles, selectedProfileId: selectedId, isLoadingProfiles: false };
      });
    } catch (err) {
      console.error('Load profiles failed:', err);
      const friendly = formatFriendlyError(err, 'Load Profiles').fullMessage;
      set({ error: friendly, isLoadingProfiles: false });
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
      console.error('Save profile failed:', err);
      const friendly = formatFriendlyError(err, 'Save Profile').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  saveAndConnect: async (profile: ConnectionProfile) => {
    set((state) => ({
      connectingProfileIds: { ...state.connectingProfileIds, [profile.id]: true },
      error: null,
    }));

    let sessionId: string | null = null;

    try {
      const config: SessionConfig = {
        profile_id: profile.id,
        mode: profile.mode,
        connect_locators: profile.connect_locators,
        listen_locators: profile.listen_locators,
        scout_multicast: profile.scout_multicast,
        user_auth: profile.user_auth,
        tls_config: profile.tls_config,
        custom_config: profile.custom_config,
      };

      // 1. Attempt connection first
      sessionId = await connectSession(config);
      const sessionInfo = await getSessionInfo(sessionId);

      // 2. Persist profile ONLY after successful connection
      await saveProfileIpc(profile);

      set((state) => {
        const index = state.profiles.findIndex((p) => p.id === profile.id);
        const newProfiles =
          index >= 0
            ? state.profiles.map((p) => (p.id === profile.id ? profile : p))
            : [...state.profiles, profile];
        return {
          profiles: newProfiles,
          selectedProfileId: profile.id,
          activeSessions: { ...state.activeSessions, [profile.id]: sessionInfo },
          sessionToProfile: { ...state.sessionToProfile, [sessionId!]: profile.id },
          connectingProfileIds: { ...state.connectingProfileIds, [profile.id]: false },
        };
      });

      return sessionId;
    } catch (err) {
      if (sessionId) {
        try {
          await disconnectSession(sessionId);
        } catch {
          // Ignore disconnect error during cleanup
        }
      }

      const friendly = formatFriendlyError(err, 'Connection Failed').fullMessage;
      console.error('Session connection failed:', err);
      set((state) => ({
        connectingProfileIds: { ...state.connectingProfileIds, [profile.id]: false },
        error: friendly,
      }));
      throw new Error(friendly);
    }
  },

  testConnection: async (config: SessionConfig) => {
    try {
      const sessionId = await connectSession(config);
      await disconnectSession(sessionId);
      return { success: true, message: 'Successfully verified connection to Zenoh router!' };
    } catch (err) {
      console.error('Test connection failed:', err);
      const friendly = formatFriendlyError(err, 'Connection Test Failed').fullMessage;
      return { success: false, message: friendly };
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
      console.error('Delete profile failed:', err);
      const friendly = formatFriendlyError(err, 'Delete Profile').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  connect: async (profileId: string) => {
    const profile = get().profiles.find((p) => p.id === profileId);
    if (!profile) {
      const msg = `Profile with id '${profileId}' not found.`;
      set({ error: msg });
      throw new Error(msg);
    }

    if (get().connectingProfileIds[profileId]) {
      return get().activeSessions[profileId]?.id;
    }

    set((state) => ({
      connectingProfileIds: { ...state.connectingProfileIds, [profileId]: true },
      error: null,
    }));

    try {
      const config: SessionConfig = {
        profile_id: profile.id,
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

      // If the session obtained bound_locators with real IPs and ports, auto-update the stored profile in SQLite
      if (sessionInfo.bound_locators && sessionInfo.bound_locators.length > 0) {
        const hasWildcardOrEphemeral = profile.listen_locators.some(
          (l) => l.includes(':0') || l.includes('0.0.0.0') || l.includes('[::]')
        );
        if (hasWildcardOrEphemeral) {
          const updated: ConnectionProfile = {
            ...profile,
            listen_locators: sessionInfo.bound_locators,
            updated_at: Date.now(),
          };
          saveProfileIpc(updated).catch((e) =>
            console.warn('Could not auto-persist bound locators to storage:', e)
          );
          set((state) => ({
            profiles: state.profiles.map((p) => (p.id === profile.id ? updated : p)),
          }));
        }
      }

      set((state) => ({
        activeSessions: { ...state.activeSessions, [profileId]: sessionInfo },
        sessionToProfile: { ...state.sessionToProfile, [sessionId]: profileId },
        connectingProfileIds: { ...state.connectingProfileIds, [profileId]: false },
      }));

      // Background TCP link & router handshakes take 50-300ms to establish.
      // Refresh session info shortly after connect to capture newly linked upstream routers and peers.
      setTimeout(() => {
        get().refreshSessions();
      }, 350);
      setTimeout(() => {
        get().refreshSessions();
      }, 1000);

      return sessionId;
    } catch (err) {
      console.error('Connect failed:', err);
      const friendly = formatFriendlyError(err, 'Connection Failed').fullMessage;
      set((state) => ({
        connectingProfileIds: { ...state.connectingProfileIds, [profileId]: false },
        error: friendly,
      }));
      throw new Error(friendly);
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
      console.error('Disconnect failed:', err);
      const friendly = formatFriendlyError(err, 'Disconnect Session').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  scout: async (timeoutMs: number = 3000) => {
    set({ isScouting: true, error: null });
    try {
      const nodes = await scoutNodes(timeoutMs);
      set({ scoutedNodes: nodes, isScouting: false });
      return nodes;
    } catch (err) {
      console.error('Scout failed:', err);
      const friendly = formatFriendlyError(err, 'Scout LAN').fullMessage;
      set({ error: friendly, isScouting: false });
      throw new Error(friendly);
    }
  },

  refreshSessions: async () => {
    try {
      const sessions = await getAllSessions();
      const currentMapping = get().sessionToProfile;
      const nextActive: Record<string, SessionInfo> = {};
      const nextSessionToProfile: Record<string, string> = { ...currentMapping };

      for (const s of sessions) {
        const profileId = s.profile_id || currentMapping[s.id];
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
      console.error('Refresh sessions failed:', err);
      const friendly = formatFriendlyError(err, 'Refresh Sessions').fullMessage;
      set({ error: friendly });
    }
  },

  setError: (error: string | null) => set({ error }),

  handleSessionStatus: (event: SessionStatusEvent) => {
    const { sessionId, status, error } = event;

    if (status === 'connected') {
      get().refreshSessions();
      return;
    }

    const profileId = get().sessionToProfile[sessionId];

    if (status === 'disconnected' || status === 'error') {
      set((state) => {
        const nextActive = { ...state.activeSessions };
        if (profileId) {
          delete nextActive[profileId];
        } else {
          for (const [pId, sess] of Object.entries(nextActive)) {
            if (sess.id === sessionId) {
              delete nextActive[pId];
            }
          }
        }

        const nextSessionToProfile = { ...state.sessionToProfile };
        delete nextSessionToProfile[sessionId];

        const nextConnecting = { ...state.connectingProfileIds };
        if (profileId) {
          delete nextConnecting[profileId];
        }

        const errorMsg = error
          ? formatFriendlyError(error, 'Connection Lost').fullMessage
          : null;
        return {
          activeSessions: nextActive,
          sessionToProfile: nextSessionToProfile,
          connectingProfileIds: nextConnecting,
          ...(errorMsg ? { error: errorMsg } : {}),
        };
      });
    }
  },

  initStatusListener: async () => {
    if (get().isListeningStatus && get().statusUnlistenFn) {
      return;
    }

    try {
      const unlisten = await onSessionStatus((event: SessionStatusEvent) => {
        get().handleSessionStatus(event);
      });
      set({ isListeningStatus: true, statusUnlistenFn: unlisten });
    } catch (err) {
      set({ error: `Failed to initialize session status listener: ${err}` });
    }
  },

  cleanupStatusListener: () => {
    const unlisten = get().statusUnlistenFn;
    if (unlisten) {
      unlisten();
    }
    set({ isListeningStatus: false, statusUnlistenFn: null });
  },

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

  getBoundLocators: (profileId?: string) => {
    const targetId = profileId ?? get().selectedProfileId;
    const session = targetId ? get().activeSessions[targetId] : undefined;
    return session?.bound_locators || [];
  },
}));
