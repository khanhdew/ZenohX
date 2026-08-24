/**
 * Message & Subscription Store (Zustand)
 * Manages active subscriptions, real-time message ring buffer, payload publishing, and event listeners.
 */

import { create } from 'zustand';
import type {
  EncodingType,
  MessageItem,
  PublishOptions,
  PutKind,
  StreamGeneratorConfig,
  SubscribeOptions,
  SubscriptionItem,
  SubscriptionPreset,
  ZenohSample,
} from '../types/zenoh';
import {
  clearMessageHistory,
  deleteMessage as deleteMessageIpc,
  deleteSubscriptionPreset,
  loadSubscriptionPresets,
  onZenohSamplesBatched,
  publishSample,
  queryMessages,
  saveSubscriptionPreset,
  startStreamGenerator,
  stopStreamGenerator,
  subscribeKey,
  unsubscribeKey,
} from '../lib/tauri';
import { normalizeEncoding, encodePayload } from '../lib/formatters';
import { formatFriendlyError } from '../lib/errorUtils';
import { useConnectionStore } from './connectionStore';
import { useTrafficStore } from './trafficStore';
import { useTopologyStore } from './topologyStore';
import type { UnlistenFn } from '@tauri-apps/api/event';



// Palette of colors for subscription badges
const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface OutgoingPubRecord {
  sessionId: string;
  keyExpr: string;
  length: number;
  timestamp: number;
}

const recentOutgoingPubs: OutgoingPubRecord[] = [];

export interface MessageState {
  subscriptions: SubscriptionItem[];
  messages: MessageItem[];
  maxMessages: number;
  activeFilterKey: string;
  searchQuery: string;
  selectedMessage: MessageItem | null;
  isListening: boolean;
  unlistenFn: UnlistenFn | null;
  unlistenBatchedFn: UnlistenFn | null;
  error: string | null;

  // Live tailing & performance controls
  isPaused: boolean;
  pausedBuffer: MessageItem[];
  togglePause: () => void;
  resumeLive: () => void;

  // Stream generators
  activeGenerators: Record<string, StreamGeneratorConfig>;
  startGenerator: (config: StreamGeneratorConfig) => Promise<void>;
  stopGenerator: (generatorId: string) => Promise<void>;

  // Actions
  initListener: () => Promise<void>;
  cleanupListener: () => void;

  subscribe: (
    sessionId: string,
    keyExpr: string,
    encoding?: EncodingType | string,
    colorTag?: string,
    profileId?: string,
    options?: SubscribeOptions
  ) => Promise<string>;

  unsubscribe: (sessionId: string, subId: string) => Promise<void>;
  toggleSubscription: (sessionId: string, subId: string) => Promise<void>;
  updateSubscription: (
    subId: string,
    updates: {
      keyExpr?: string;
      encoding?: EncodingType | string;
      colorTag?: string;
      active?: boolean;
      allowedOrigin?: string;
    },
    activeSessionId?: string
  ) => Promise<void>;
  loadSubscriptions: (profileId: string, activeSessionId?: string) => Promise<void>;

  publish: (
    sessionId: string,
    keyExpr: string,
    payload: number[] | Uint8Array | string,
    encoding?: EncodingType | string,
    kind?: PutKind | string,
    profileId?: string,
    options?: { protoTypeName?: string; qos?: PublishOptions }
  ) => Promise<void>;

  addMessage: (msg: MessageItem) => void;
  addMessagesBatch: (msgs: MessageItem[]) => void;
  clearMessages: (sessionId?: string, profileId?: string) => Promise<void>;
  deleteMessage: (messageId: number | string) => Promise<void>;
  selectMessage: (msg: MessageItem | null) => void;
  setActiveFilterKey: (key: string) => void;
  setSearchQuery: (query: string) => void;
  setMaxMessages: (max: number) => void;
  loadHistory: (profileId?: string, limit?: number, offset?: number) => Promise<void>;
  setError: (error: string | null) => void;

  // Selectors / Helpers
  getSubscriptionsForSession: (sessionId: string) => SubscriptionItem[];
  getFilteredMessages: (sessionId?: string) => MessageItem[];
}

let listenerInitPromise: Promise<void> | null = null;

export const useMessageStore = create<MessageState>((set, get) => ({
  subscriptions: [],
  messages: [],
  maxMessages: 2000,
  activeFilterKey: '',
  searchQuery: '',
  selectedMessage: null,
  isListening: false,
  unlistenFn: null,
  unlistenBatchedFn: null,
  error: null,

  isPaused: false,
  pausedBuffer: [],
  activeGenerators: {},

  togglePause: () => {
    const wasPaused = get().isPaused;
    if (wasPaused) {
      get().resumeLive();
    } else {
      set({ isPaused: true });
    }
  },

  resumeLive: () => {
    set((state) => {
      const merged = [...state.messages, ...state.pausedBuffer];
      if (merged.length > state.maxMessages) {
        merged.splice(0, merged.length - state.maxMessages);
      }
      return {
        isPaused: false,
        pausedBuffer: [],
        messages: merged,
      };
    });
  },

  startGenerator: async (config: StreamGeneratorConfig) => {
    set({ error: null });
    try {
      await startStreamGenerator(config);
      set((state) => ({
        activeGenerators: {
          ...state.activeGenerators,
          [config.generator_id]: config,
        },
      }));
    } catch (err) {
      console.error('Start stream generator failed:', err);
      const friendly = formatFriendlyError(err, 'Start Generator').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  stopGenerator: async (generatorId: string) => {
    set({ error: null });
    try {
      await stopStreamGenerator(generatorId);
      set((state) => {
        const copy = { ...state.activeGenerators };
        delete copy[generatorId];
        return { activeGenerators: copy };
      });
    } catch (err) {
      console.error('Stop stream generator failed:', err);
      const friendly = formatFriendlyError(err, 'Stop Generator').fullMessage;
      set({ error: friendly });
    }
  },

  initListener: async () => {
    if (get().isListening && (get().unlistenFn || get().unlistenBatchedFn)) {
      return;
    }
    if (listenerInitPromise) {
      return listenerInitPromise;
    }

    listenerInitPromise = (async () => {
      try {
        // Clean up any stale listeners first
        const prev = get().unlistenBatchedFn;
        if (prev) {
          try {
            prev();
          } catch {
            // Ignore
          }
        }

        // Listen for batched high-throughput samples (frame-rate aligned 60 FPS)
        const unlistenBatched = await onZenohSamplesBatched((samples: ZenohSample[]) => {
          if (!samples || samples.length === 0) return;

          const now = Date.now();
          while (recentOutgoingPubs.length > 0 && now - recentOutgoingPubs[0].timestamp > 4000) {
            recentOutgoingPubs.shift();
          }

          const state = get();
          const newItems: MessageItem[] = [];

          for (const sample of samples) {
            // Strictly discard all messages that don't have a valid publisher ZID (source_id)
            if (!sample.source_id || sample.source_id.trim() === '' || sample.source_id === '0') {
              continue;
            }

            const profileId = useConnectionStore.getState().sessionToProfile[sample.session_id];
            const activeSession = useConnectionStore.getState().getActiveSession(sample.session_id);
            const localZid = activeSession?.zid?.toLowerCase();
            const sourceZid = sample.source_id.toLowerCase();

            // Check if this sample is an echo/loopback of our own publication on the same session
            const isSelfZid = Boolean(localZid && sourceZid && localZid === sourceZid);
            const isSelfPublished =
              isSelfZid ||
              recentOutgoingPubs.some(
                (p) =>
                  p.sessionId === sample.session_id &&
                  p.keyExpr === sample.key_expr &&
                  p.length === (sample.payload?.length || 0) &&
                  Math.abs(now - p.timestamp) < 2000
              );

            if (isSelfPublished) {
              // This message was already added as 'outgoing' by publish();
              // Skip adding duplicate 'incoming' loopback message.
              continue;
            }

            const item: MessageItem = {
              id: generateId(),
              sessionId: sample.session_id,
              profileId,
              subId: sample.sub_id,
              direction: 'incoming',
              keyExpr: sample.key_expr,
              payload: sample.payload,
              encoding: normalizeEncoding(sample.encoding, sample.payload, sample.key_expr),
              kind: (sample.kind as PutKind) || 'put',
              timestamp: sample.timestamp || Date.now(),
              sourceId: sample.source_id || undefined,
              priority: sample.priority || undefined,
              express: sample.express || undefined,
              attachment: sample.attachment || undefined,
            };
            newItems.push(item);

            useTrafficStore.getState().recordEvent({
              sessionId: sample.session_id,
              profileId,
              direction: 'inbound',
              opType: 'sub',
              keyExpr: sample.key_expr,
              bytes: sample.payload?.length || 0,
            });

            useTopologyStore.getState().triggerLinkTraffic(
              sample.session_id,
              sample.source_id,
              {
                keyExpr: sample.key_expr,
                bytes: sample.payload?.length || 0,
                direction: 'inbound',
              }
            );
          }


          if (newItems.length === 0) return;

          if (state.isPaused) {
            set((s) => ({
              pausedBuffer: [...s.pausedBuffer, ...newItems].slice(-5000),
            }));
            return;
          }

          get().addMessagesBatch(newItems);
        });

        set({ isListening: true, unlistenBatchedFn: unlistenBatched });
      } catch (err) {
        set({ error: `Failed to initialize sample listener: ${err}` });
      } finally {
        listenerInitPromise = null;
      }
    })();

    return listenerInitPromise;
  },

  cleanupListener: () => {
    const unlisten = get().unlistenFn;
    if (unlisten) {
      try {
        unlisten();
      } catch {
        // Ignore
      }
    }
    const unlistenBatched = get().unlistenBatchedFn;
    if (unlistenBatched) {
      try {
        unlistenBatched();
      } catch {
        // Ignore
      }
    }
    listenerInitPromise = null;
    set({ isListening: false, unlistenFn: null, unlistenBatchedFn: null });
  },

  subscribe: async (
    sessionId: string,
    keyExpr: string,
    encoding: EncodingType | string = 'json',
    colorTag?: string,
    profileId?: string,
    options?: SubscribeOptions
  ) => {
    set({ error: null });
    const targetProfileId =
      profileId ||
      (sessionId ? useConnectionStore.getState().sessionToProfile[sessionId] : undefined) ||
      useConnectionStore.getState().selectedProfileId ||
      '';
    const subId = generateId();

    try {
      if (sessionId) {
        await subscribeKey(sessionId, subId, keyExpr, options);
      }

      const colorIndex = get().subscriptions.length % COLOR_PALETTE.length;
      const tag = colorTag || COLOR_PALETTE[colorIndex];

      const newSub: SubscriptionItem = {
        id: subId,
        sessionId: sessionId || '',
        profileId: targetProfileId,
        keyExpr,
        encoding,
        colorTag: tag,
        count: 0,
        active: Boolean(sessionId),
        createdAt: Date.now(),
        allowedOrigin: options?.allowed_origin,
      };

      // Persist as subscription preset in SQLite
      if (targetProfileId) {
        const preset: SubscriptionPreset = {
          id: subId,
          profile_id: targetProfileId,
          key_expr: keyExpr,
          default_encoding: encoding,
          auto_subscribe: true,
          color_tag: tag,
        };
        try {
          await saveSubscriptionPreset(preset);
        } catch {
          // Ignore if profile is unsaved
        }
      }

      set((state) => ({
        subscriptions: [...state.subscriptions.filter((s) => s.id !== subId), newSub],
      }));

      // Ensure event listener is active if session is online
      if (sessionId && !get().isListening) {
        await get().initListener();
      }

      return subId;
    } catch (err) {
      console.error('Subscribe failed:', err);
      const friendly = formatFriendlyError(err, 'Subscription Failed').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  unsubscribe: async (sessionId: string, subId: string) => {
    set({ error: null });
    try {
      if (sessionId) {
        try {
          await unsubscribeKey(sessionId, subId);
        } catch {
          // Ignore if session already closed
        }
      }

      // Delete preset from SQLite database
      try {
        await deleteSubscriptionPreset(subId);
      } catch {
        // Ignore
      }

      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.id !== subId),
      }));
    } catch (err) {
      console.error('Unsubscribe failed:', err);
      const friendly = formatFriendlyError(err, 'Unsubscribe Failed').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  toggleSubscription: async (sessionId: string, subId: string) => {
    const sub = get().subscriptions.find((s) => s.id === subId);
    if (!sub) return;

    set({ error: null });
    try {
      if (sub.active) {
        const targetSessionId = sessionId || sub.sessionId;
        if (targetSessionId) {
          try {
            await unsubscribeKey(targetSessionId, subId);
          } catch {
            // Ignore
          }
        }
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === subId ? { ...s, active: false } : s
          ),
        }));

        if (sub.profileId) {
          try {
            await saveSubscriptionPreset({
              id: sub.id,
              profile_id: sub.profileId,
              key_expr: sub.keyExpr,
              default_encoding: sub.encoding,
              auto_subscribe: false,
              color_tag: sub.colorTag,
            });
          } catch {
            // Ignore
          }
        }
      } else {
        const targetSessionId = sessionId || sub.sessionId;
        if (targetSessionId) {
          const subOptions =
            sub.allowedOrigin && sub.allowedOrigin !== 'any'
              ? { allowed_origin: sub.allowedOrigin }
              : undefined;
          await subscribeKey(targetSessionId, subId, sub.keyExpr, subOptions);
          set((state) => ({
            subscriptions: state.subscriptions.map((s) =>
              s.id === subId ? { ...s, active: true, sessionId: targetSessionId } : s
            ),
          }));
          if (!get().isListening) {
            await get().initListener();
          }
        } else {
          set((state) => ({
            subscriptions: state.subscriptions.map((s) =>
              s.id === subId ? { ...s, active: true } : s
            ),
          }));
        }

        if (sub.profileId) {
          try {
            await saveSubscriptionPreset({
              id: sub.id,
              profile_id: sub.profileId,
              key_expr: sub.keyExpr,
              default_encoding: sub.encoding,
              auto_subscribe: true,
              color_tag: sub.colorTag,
            });
          } catch {
            // Ignore
          }
        }
      }
    } catch (err) {
      console.error('Toggle subscription failed:', err);
      const friendly = formatFriendlyError(err, 'Toggle Subscription').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  updateSubscription: async (
    subId: string,
    updates: {
      keyExpr?: string;
      encoding?: EncodingType | string;
      colorTag?: string;
      active?: boolean;
      allowedOrigin?: string;
    },
    activeSessionId?: string
  ) => {
    const sub = get().subscriptions.find((s) => s.id === subId);
    if (!sub) return;

    set({ error: null });
    try {
      const newKeyExpr = updates.keyExpr !== undefined ? updates.keyExpr.trim() : sub.keyExpr;
      const newEncoding = (updates.encoding !== undefined ? updates.encoding : sub.encoding) as EncodingType;
      const newColorTag = updates.colorTag !== undefined ? updates.colorTag : sub.colorTag;
      const newActive = updates.active !== undefined ? updates.active : sub.active;
      const newAllowedOrigin = updates.allowedOrigin !== undefined ? updates.allowedOrigin : sub.allowedOrigin;

      const keyChanged = newKeyExpr !== sub.keyExpr;
      const originChanged = newAllowedOrigin !== sub.allowedOrigin;
      const targetSessionId = activeSessionId || sub.sessionId;

      const subOptions = newAllowedOrigin && newAllowedOrigin !== 'any' ? { allowed_origin: newAllowedOrigin } : undefined;

      // If active session is connected, handle dynamic resubscription
      if (targetSessionId) {
        if (sub.active && (keyChanged || originChanged)) {
          try {
            await unsubscribeKey(targetSessionId, subId);
          } catch {
            // Ignore
          }
          if (newActive) {
            await subscribeKey(targetSessionId, subId, newKeyExpr, subOptions);
            if (!get().isListening) {
              await get().initListener();
            }
          }
        } else if (!sub.active && newActive) {
          await subscribeKey(targetSessionId, subId, newKeyExpr, subOptions);
          if (!get().isListening) {
            await get().initListener();
          }
        } else if (sub.active && !newActive) {
          try {
            await unsubscribeKey(targetSessionId, subId);
          } catch {
            // Ignore
          }
        }
      }

      const updatedSub: SubscriptionItem = {
        ...sub,
        keyExpr: newKeyExpr,
        encoding: newEncoding,
        colorTag: newColorTag,
        active: newActive,
        allowedOrigin: newAllowedOrigin,
        sessionId: targetSessionId || sub.sessionId,
      };

      // Persist changes in SQLite
      if (sub.profileId) {
        await saveSubscriptionPreset({
          id: sub.id,
          profile_id: sub.profileId,
          key_expr: newKeyExpr,
          default_encoding: newEncoding,
          auto_subscribe: newActive,
          color_tag: newColorTag,
        });
      }

      set((state) => ({
        subscriptions: state.subscriptions.map((s) => (s.id === subId ? updatedSub : s)),
      }));
    } catch (err) {
      console.error('Update subscription failed:', err);
      const friendly = formatFriendlyError(err, 'Update Subscription').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  loadSubscriptions: async (profileId: string, activeSessionId?: string) => {
    if (!profileId) return;
    try {
      const presets = (await loadSubscriptionPresets(profileId)) || [];
      const currentSubs = get().subscriptions;

      const loadedSubs: SubscriptionItem[] = [];

      for (const preset of presets) {
        // STRICT SCOPE: Only match existing subscriptions belonging to the SAME profile
        const existing = currentSubs.find(
          (s) => s.profileId === profileId && (s.id === preset.id || s.keyExpr === preset.key_expr)
        );
        let isActive = false;

        if (activeSessionId && preset.auto_subscribe) {
          try {
            await subscribeKey(activeSessionId, preset.id, preset.key_expr);
            isActive = true;
          } catch {
            isActive = false;
          }
        } else if (activeSessionId && existing?.active) {
          if (existing.sessionId !== activeSessionId) {
            try {
              await subscribeKey(activeSessionId, preset.id, preset.key_expr);
              isActive = true;
            } catch {
              isActive = false;
            }
          } else {
            isActive = true;
          }
        } else {
          // Inactive when not connected
          isActive = false;
        }

        loadedSubs.push({
          id: preset.id,
          sessionId: activeSessionId || existing?.sessionId || '',
          profileId: preset.profile_id,
          keyExpr: preset.key_expr,
          encoding: (preset.default_encoding as EncodingType) || 'json',
          colorTag:
            preset.color_tag ||
            existing?.colorTag ||
            COLOR_PALETTE[loadedSubs.length % COLOR_PALETTE.length],
          count: existing?.count || 0,
          active: isActive,
          createdAt: existing?.createdAt || Date.now(),
        });
      }

      if (loadedSubs.some((s) => s.active) && !get().isListening) {
        await get().initListener();
      }

      set((state) => {
        // Preserve all subscriptions belonging to other profiles
        const otherSubs = state.subscriptions.filter(
          (s) => s.profileId && s.profileId !== profileId
        );
        // Also preserve any in-memory subscriptions for this profile not in presets yet
        const inMemoryUnsaved = state.subscriptions.filter(
          (s) =>
            s.profileId === profileId &&
            !presets.some((p) => p.id === s.id || p.key_expr === s.keyExpr)
        );
        return { subscriptions: [...otherSubs, ...loadedSubs, ...inMemoryUnsaved] };
      });
    } catch (err) {
      console.error('Load subscriptions failed:', err);
      const friendly = formatFriendlyError(err, 'Load Subscriptions').fullMessage;
      set({ error: friendly });
    }
  },

  publish: async (
    sessionId: string,
    keyExpr: string,
    payload: number[] | Uint8Array | string,
    encoding: EncodingType | string = 'json',
    kind: PutKind | string = 'put',
    profileId?: string,
    options?: { protoTypeName?: string; qos?: PublishOptions }
  ) => {
    set({ error: null });
    try {
      let bytesToSend: number[] | Uint8Array;
      if (typeof payload === 'string') {
        const encResult = encodePayload(payload, encoding, {
          keyExpr,
          protoTypeName: options?.protoTypeName,
        });
        if (!encResult.isValid) {
          throw new Error(encResult.error || `Failed to encode payload as ${encoding}`);
        }
        bytesToSend = encResult.bytes;
      } else {
        bytesToSend = payload;
      }

      await publishSample(sessionId, keyExpr, bytesToSend, encoding, kind, options?.qos);

      const normalizedPayload =
        bytesToSend instanceof Uint8Array ? Array.from(bytesToSend) : bytesToSend;

      const targetProfileId =
        profileId || useConnectionStore.getState().sessionToProfile[sessionId];

      useTrafficStore.getState().recordEvent({
        sessionId,
        profileId: targetProfileId,
        direction: 'outbound',
        opType: 'pub',
        keyExpr,
        bytes: normalizedPayload.length,
      });

      useTopologyStore.getState().triggerLinkTraffic(sessionId, undefined, {
        keyExpr,
        bytes: normalizedPayload.length,
        direction: 'outbound',
      });


      const activeSession = useConnectionStore.getState().getActiveSession(sessionId);
      const pubTimestamp = Date.now();

      recentOutgoingPubs.push({
        sessionId,
        keyExpr,
        length: normalizedPayload.length,
        timestamp: pubTimestamp,
      });
      if (recentOutgoingPubs.length > 200) {
        recentOutgoingPubs.shift();
      }

      const item: MessageItem = {
        id: generateId(),
        sessionId,
        profileId: targetProfileId,
        direction: 'outgoing',
        keyExpr,
        payload: normalizedPayload,
        encoding,
        kind,
        timestamp: pubTimestamp,
        senderZid: activeSession?.zid || undefined,
        priority: options?.qos?.priority || undefined,
        express: options?.qos?.express || undefined,
        attachment: options?.qos?.attachment || undefined,
      };

      get().addMessage(item);
    } catch (err) {
      console.error('Publish failed:', err);
      const friendly = formatFriendlyError(err, 'Publish Failed').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  addMessage: (msg: MessageItem) => {
    set((state) => {
      // Check recent messages for duplicate
      const recentWindow = state.messages.slice(-100);
      const isDuplicate = recentWindow.some((m) => {
        if (m.id === msg.id) return true;
        const keyMatch = m.keyExpr === msg.keyExpr;
        const dirMatch = m.direction === msg.direction;
        const timeMatch = Math.abs(m.timestamp - msg.timestamp) < 1000;
        const lenMatch = (m.payload?.length || 0) === (msg.payload?.length || 0);
        const profileMatch = !m.profileId || !msg.profileId || m.profileId === msg.profileId;
        return keyMatch && dirMatch && timeMatch && lenMatch && profileMatch;
      });
      if (isDuplicate) return state;

      const newMessages = [...state.messages, msg];
      if (newMessages.length > state.maxMessages) {
        newMessages.splice(0, newMessages.length - state.maxMessages);
      }
      return { messages: newMessages };
    });
  },

  addMessagesBatch: (msgs: MessageItem[]) => {
    if (!msgs || msgs.length === 0) return;
    set((state) => {
      // 1. Deduplicate new batch internally and against recent in-memory messages
      const recentWindow = state.messages.slice(-300);
      const seenSignatures = new Set(
        recentWindow.map(
          (m) =>
            `${m.sessionId || m.profileId || ''}:${m.keyExpr}:${m.timestamp}:${m.id || ''}:${m.direction}`
        )
      );

      const uniqueMsgs: MessageItem[] = [];
      for (const msg of msgs) {
        const sig = `${msg.sessionId || msg.profileId || ''}:${msg.keyExpr}:${msg.timestamp}:${msg.id || ''}:${msg.direction}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          uniqueMsgs.push(msg);
        }
      }

      // Tally message counts per subscription
      const countMap = new Map<string, number>();
      for (const msg of uniqueMsgs) {
        if (msg.subId) {
          countMap.set(msg.subId, (countMap.get(msg.subId) || 0) + 1);
        } else {
          const key = `${msg.sessionId}:${msg.keyExpr}`;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
      }

      const updatedSubs = state.subscriptions.map((sub) => {
        const byId = countMap.get(sub.id) || 0;
        const byKey = countMap.get(`${sub.sessionId}:${sub.keyExpr}`) || 0;
        const added = byId || byKey;
        if (added > 0) {
          return { ...sub, count: sub.count + added };
        }
        return sub;
      });

      if (uniqueMsgs.length === 0) {
        return { subscriptions: updatedSubs };
      }

      let merged = [...state.messages, ...uniqueMsgs];
      if (merged.length > state.maxMessages) {
        merged = merged.slice(merged.length - state.maxMessages);
      }

      return {
        messages: merged,
        subscriptions: updatedSubs,
      };
    });
  },

  clearMessages: async (sessionId?: string, profileId?: string) => {
    set((state) => {
      if (sessionId || profileId) {
        return {
          messages: state.messages.filter((m) => {
            if (sessionId && m.sessionId === sessionId) return false;
            if (profileId && m.profileId === profileId) return false;
            return true;
          }),
          selectedMessage:
            (sessionId && state.selectedMessage?.sessionId === sessionId) ||
            (profileId && state.selectedMessage?.profileId === profileId)
              ? null
              : state.selectedMessage,
        };
      }
      return { messages: [], selectedMessage: null };
    });

    try {
      await clearMessageHistory(profileId);
    } catch {
      // Ignore
    }
  },

  deleteMessage: async (messageId: number | string) => {
    const idStr = String(messageId);
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== idStr),
      selectedMessage: state.selectedMessage?.id === idStr ? null : state.selectedMessage,
    }));

    const numId = Number(messageId);
    if (!Number.isNaN(numId) && numId > 0) {
      try {
        await deleteMessageIpc(numId);
      } catch {
        // Ignore
      }
    }
  },

  selectMessage: (msg: MessageItem | null) => {
    set({ selectedMessage: msg });
  },

  setActiveFilterKey: (key: string) => {
    set({ activeFilterKey: key });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setMaxMessages: (max: number) => {
    set((state) => {
      let messages = state.messages;
      if (messages.length > max) {
        messages = messages.slice(messages.length - max);
      }
      return { maxMessages: max, messages };
    });
  },

  loadHistory: async (profileId?: string, limit: number = 100, offset: number = 0) => {
    set({ error: null });
    try {
      const stored = await queryMessages(profileId, limit, offset);
      const activeSession = profileId
        ? useConnectionStore.getState().activeSessions[profileId]
        : undefined;
      const defaultSessionId = activeSession?.id || '';

      set((state) => {
        const existingMessages = [...state.messages];

        for (const m of stored) {
          const storedIdStr = String(m.id);
          const payloadLen = m.payload?.length || 0;

          // Check if an existing in-memory message matches this database record
          const existingIdx = existingMessages.findIndex((existing) => {
            if (existing.id === storedIdStr) return true;
            const profileMatch =
              !m.profile_id || !existing.profileId || m.profile_id === existing.profileId;
            const keyMatch = existing.keyExpr === m.key_expr;
            const dirMatch = existing.direction === m.direction;
            const timeMatch = Math.abs(existing.timestamp - m.timestamp) < 1000;
            const lenMatch = (existing.payload?.length || 0) === payloadLen;
            return profileMatch && keyMatch && dirMatch && timeMatch && lenMatch;
          });

          if (existingIdx !== -1) {
            // Merge SQLite persistent ID into existing message, preserving its active sessionId
            existingMessages[existingIdx] = {
              ...existingMessages[existingIdx],
              id: storedIdStr,
              sessionId: existingMessages[existingIdx].sessionId || defaultSessionId,
              profileId: existingMessages[existingIdx].profileId || m.profile_id,
            };
          } else {
            // New message from SQLite
            const item: MessageItem = {
              id: storedIdStr,
              sessionId: defaultSessionId,
              profileId: m.profile_id,
              direction: (m.direction as 'incoming' | 'outgoing') || 'incoming',
              keyExpr: m.key_expr,
              payload: m.payload,
              encoding: normalizeEncoding(m.encoding, m.payload),
              kind: (m.kind as PutKind) || 'put',
              timestamp: m.timestamp,
              sourceId: m.direction === 'incoming' ? (m.source_id || undefined) : undefined,
              senderZid: m.direction === 'outgoing' ? (m.source_id || undefined) : undefined,
            };
            existingMessages.push(item);
          }
        }

        // Deduplicate any remaining items by signature
        const seenSignatures = new Set<string>();
        const uniqueMessages: MessageItem[] = [];

        // Sort chronologically ascending
        existingMessages.sort((a, b) => a.timestamp - b.timestamp);

        for (const item of existingMessages) {
          const payloadLen = item.payload?.length || 0;
          const sig = `${item.profileId || ''}:${item.keyExpr}:${item.direction}:${item.timestamp}:${payloadLen}`;
          if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            uniqueMessages.push(item);
          }
        }

        if (uniqueMessages.length > state.maxMessages) {
          uniqueMessages.splice(0, uniqueMessages.length - state.maxMessages);
        }

        return { messages: uniqueMessages };
      });
    } catch (err) {
      console.error('Load history failed:', err);
      const friendly = formatFriendlyError(err, 'Message History').fullMessage;
      set({ error: friendly });
    }
  },

  setError: (error: string | null) => set({ error }),

  getSubscriptionsForSession: (sessionId: string) => {
    return get().subscriptions.filter((s) => s.sessionId === sessionId);
  },

  getFilteredMessages: (sessionId?: string) => {
    const { messages, activeFilterKey, searchQuery } = get();
    return messages.filter((m) => {
      // Filter by session if provided
      if (sessionId && m.sessionId && m.sessionId !== sessionId) {
        return false;
      }

      // Filter by key expression prefix/wildcard match
      if (activeFilterKey) {
        const cleanFilter = activeFilterKey.replace(/\*\*?$/, '');
        if (!m.keyExpr.includes(cleanFilter)) {
          return false;
        }
      }

      // Filter by text search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const keyMatch = m.keyExpr.toLowerCase().includes(q);
        if (keyMatch) return true;

        // Try matching payload as string if utf-8
        try {
          const str = new TextDecoder().decode(new Uint8Array(m.payload));
          if (str.toLowerCase().includes(q)) return true;
        } catch {
          // Ignore decode errors
        }

        return false;
      }

      return true;
    });
  },
}));
