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

    try {
      // Listen for batched high-throughput samples (frame-rate aligned 60 FPS)
      const unlistenBatched = await onZenohSamplesBatched((samples: ZenohSample[]) => {
        if (!samples || samples.length === 0) return;

        const state = get();
        const newItems: MessageItem[] = [];

        for (const sample of samples) {
          const profileId = useConnectionStore.getState().sessionToProfile[sample.session_id];
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
        }

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
    }
  },

  cleanupListener: () => {
    const unlisten = get().unlistenFn;
    if (unlisten) {
      unlisten();
    }
    const unlistenBatched = get().unlistenBatchedFn;
    if (unlistenBatched) {
      unlistenBatched();
    }
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
      profileId || useConnectionStore.getState().sessionToProfile[sessionId] || '';
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
          await subscribeKey(targetSessionId, subId, sub.keyExpr);
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
      const presets = await loadSubscriptionPresets(profileId);
      const currentSubs = get().subscriptions;

      const loadedSubs: SubscriptionItem[] = [];

      for (const preset of presets) {
        const existing = currentSubs.find(
          (s) => s.id === preset.id || s.keyExpr === preset.key_expr
        );
        let isActive = false;

        if (activeSessionId && preset.auto_subscribe) {
          try {
            await subscribeKey(activeSessionId, preset.id, preset.key_expr);
            isActive = true;
          } catch {
            isActive = false;
          }
        } else if (existing?.active && existing.sessionId === activeSessionId) {
          isActive = true;
        }

        loadedSubs.push({
          id: preset.id,
          sessionId: activeSessionId || existing?.sessionId || '',
          profileId: preset.profile_id,
          keyExpr: preset.key_expr,
          encoding: (preset.default_encoding as EncodingType) || 'json',
          colorTag:
            preset.color_tag ||
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
        const otherSubs = state.subscriptions.filter(
          (s) => s.profileId && s.profileId !== profileId
        );
        return { subscriptions: [...otherSubs, ...loadedSubs] };
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

      const activeSession = useConnectionStore.getState().getActiveSession(sessionId);
      const item: MessageItem = {
        id: generateId(),
        sessionId,
        profileId: targetProfileId,
        direction: 'outgoing',
        keyExpr,
        payload: normalizedPayload,
        encoding,
        kind,
        timestamp: Date.now(),
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
      // Tally message counts per subscription
      const countMap = new Map<string, number>();
      for (const msg of msgs) {
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

      let merged = [...state.messages, ...msgs];
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
      const mapped: MessageItem[] = stored.map((m) => ({
        id: m.id ? String(m.id) : generateId(),
        sessionId: '',
        profileId: m.profile_id,
        direction: (m.direction as 'incoming' | 'outgoing') || 'incoming',
        keyExpr: m.key_expr,
        payload: m.payload,
        encoding: normalizeEncoding(m.encoding, m.payload),
        kind: (m.kind as PutKind) || 'put',
        timestamp: m.timestamp,
      }));

      set((state) => {
        const combined = [...mapped, ...state.messages];
        // Deduplicate by id or unique timestamp + keyExpr + direction
        const seen = new Set<string>();
        const unique = combined.filter((item) => {
          const key = item.id || `${item.timestamp}-${item.keyExpr}-${item.direction}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Sort chronologically ascending for the message feed
        unique.sort((a, b) => a.timestamp - b.timestamp);

        if (unique.length > state.maxMessages) {
          unique.splice(0, unique.length - state.maxMessages);
        }

        return { messages: unique };
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
