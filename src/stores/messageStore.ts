/**
 * Message & Subscription Store (Zustand)
 * Manages active subscriptions, real-time message ring buffer, payload publishing, and event listeners.
 */

import { create } from 'zustand';
import type {
  EncodingType,
  MessageItem,
  PutKind,
  SubscriptionItem,
  ZenohSample,
} from '../types/zenoh';
import {
  onZenohSample,
  publishSample,
  queryMessages,
  subscribeKey,
  unsubscribeKey,
} from '../lib/tauri';
import { normalizeEncoding } from '../lib/formatters';
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
  error: string | null;

  // Actions
  initListener: () => Promise<void>;
  cleanupListener: () => void;

  subscribe: (
    sessionId: string,
    keyExpr: string,
    encoding?: EncodingType | string,
    colorTag?: string,
    profileId?: string
  ) => Promise<string>;

  unsubscribe: (sessionId: string, subId: string) => Promise<void>;
  toggleSubscription: (sessionId: string, subId: string) => Promise<void>;

  publish: (
    sessionId: string,
    keyExpr: string,
    payload: number[] | Uint8Array,
    encoding?: EncodingType | string,
    kind?: PutKind | string,
    profileId?: string
  ) => Promise<void>;

  addMessage: (msg: MessageItem) => void;
  clearMessages: (sessionId?: string) => void;
  selectMessage: (msg: MessageItem | null) => void;
  setActiveFilterKey: (key: string) => void;
  setSearchQuery: (query: string) => void;
  setMaxMessages: (max: number) => void;
  loadHistory: (profileId: string, limit?: number, offset?: number) => Promise<void>;
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
  error: null,

  initListener: async () => {
    if (get().isListening && get().unlistenFn) {
      return;
    }

    try {
      const unlisten = await onZenohSample((sample: ZenohSample) => {
        const item: MessageItem = {
          id: generateId(),
          sessionId: sample.session_id,
          subId: sample.sub_id,
          direction: 'incoming',
          keyExpr: sample.key_expr,
          payload: sample.payload,
          encoding: normalizeEncoding(sample.encoding, sample.payload),
          kind: (sample.kind as PutKind) || 'put',
          timestamp: sample.timestamp || Date.now(),
        };

        set((state) => {
          // Increment subscription counters
          const updatedSubs = state.subscriptions.map((sub) => {
            if (
              sub.sessionId === sample.session_id &&
              (sub.id === sample.sub_id || sub.keyExpr === sample.key_expr)
            ) {
              return { ...sub, count: sub.count + 1 };
            }
            return sub;
          });

          // Ring buffer append with max capacity limit
          const newMessages = [...state.messages, item];
          if (newMessages.length > state.maxMessages) {
            newMessages.splice(0, newMessages.length - state.maxMessages);
          }

          return {
            messages: newMessages,
            subscriptions: updatedSubs,
          };
        });
      });

      set({ isListening: true, unlistenFn: unlisten });
    } catch (err) {
      set({ error: `Failed to initialize sample listener: ${err}` });
    }
  },

  cleanupListener: () => {
    const unlisten = get().unlistenFn;
    if (unlisten) {
      unlisten();
    }
    set({ isListening: false, unlistenFn: null });
  },

  subscribe: async (
    sessionId: string,
    keyExpr: string,
    encoding: EncodingType | string = 'json',
    colorTag?: string,
    profileId?: string
  ) => {
    set({ error: null });
    const subId = generateId();

    try {
      await subscribeKey(sessionId, subId, keyExpr);

      const colorIndex = get().subscriptions.length % COLOR_PALETTE.length;
      const tag = colorTag || COLOR_PALETTE[colorIndex];

      const newSub: SubscriptionItem = {
        id: subId,
        sessionId,
        profileId,
        keyExpr,
        encoding,
        colorTag: tag,
        count: 0,
        active: true,
        createdAt: Date.now(),
      };

      set((state) => ({
        subscriptions: [...state.subscriptions, newSub],
      }));

      // Ensure event listener is active
      if (!get().isListening) {
        await get().initListener();
      }

      return subId;
    } catch (err) {
      const msg = `Failed to subscribe to '${keyExpr}': ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  unsubscribe: async (sessionId: string, subId: string) => {
    set({ error: null });
    try {
      await unsubscribeKey(sessionId, subId);
      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.id !== subId),
      }));
    } catch (err) {
      const msg = `Failed to unsubscribe '${subId}': ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  toggleSubscription: async (sessionId: string, subId: string) => {
    const sub = get().subscriptions.find((s) => s.id === subId);
    if (!sub) return;

    set({ error: null });
    try {
      if (sub.active) {
        await unsubscribeKey(sessionId, subId);
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === subId ? { ...s, active: false } : s
          ),
        }));
      } else {
        await subscribeKey(sessionId, subId, sub.keyExpr);
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === subId ? { ...s, active: true } : s
          ),
        }));
      }
    } catch (err) {
      const msg = `Failed to toggle subscription '${subId}': ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  publish: async (
    sessionId: string,
    keyExpr: string,
    payload: number[] | Uint8Array,
    encoding: EncodingType | string = 'json',
    kind: PutKind | string = 'put',
    profileId?: string
  ) => {
    set({ error: null });
    try {
      await publishSample(sessionId, keyExpr, payload, encoding, kind);

      const normalizedPayload =
        payload instanceof Uint8Array ? Array.from(payload) : payload;

      const item: MessageItem = {
        id: generateId(),
        sessionId,
        profileId,
        direction: 'outgoing',
        keyExpr,
        payload: normalizedPayload,
        encoding,
        kind,
        timestamp: Date.now(),
      };

      get().addMessage(item);
    } catch (err) {
      const msg = `Failed to publish sample to '${keyExpr}': ${err}`;
      set({ error: msg });
      throw new Error(msg);
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

  clearMessages: (sessionId?: string) => {
    set((state) => {
      if (sessionId) {
        return {
          messages: state.messages.filter((m) => m.sessionId !== sessionId),
          selectedMessage:
            state.selectedMessage?.sessionId === sessionId
              ? null
              : state.selectedMessage,
        };
      }
      return { messages: [], selectedMessage: null };
    });
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

  loadHistory: async (profileId: string, limit: number = 100, offset: number = 0) => {
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
        // Deduplicate by id if needed
        const seen = new Set<string>();
        const unique = combined.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        return { messages: unique };
      });
    } catch (err) {
      set({ error: `Failed to load message history: ${err}` });
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
