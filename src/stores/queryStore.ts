/**
 * Query & RPC Store (Zustand)
 * Manages distributed query executions, multi-reply timelines, declared queryables, and inbound query replies.
 */

import { create } from 'zustand';
import type {
  ActiveQueryable,
  EncodingType,
  InboundQuery,
  QueryExecution,
  QueryTarget,
  ReplySample,
} from '../types/zenoh';
import {
  declareQueryable as declareQueryableIpc,
  onInboundQuery,
  replyQuery as replyQueryIpc,
  runQuery as runQueryIpc,
  undeclareQueryable as undeclareQueryableIpc,
} from '../lib/tauri';
import type { UnlistenFn } from '@tauri-apps/api/event';

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

function encodeStringToBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

export interface QueryState {
  activeQueryables: ActiveQueryable[];
  inboundQueries: InboundQuery[];
  executions: QueryExecution[];
  activeExecutionId: string | null;
  isListening: boolean;
  unlistenFn: UnlistenFn | null;
  error: string | null;

  // Actions
  initListener: () => Promise<void>;
  cleanupListener: () => void;

  runQuery: (
    sessionId: string,
    selector: string,
    target?: QueryTarget | string,
    timeoutMs?: number,
    profileId?: string
  ) => Promise<ReplySample[]>;

  declareQueryable: (
    sessionId: string,
    keyExpr: string,
    autoReply?: boolean,
    replyPayload?: string,
    replyEncoding?: EncodingType | string,
    profileId?: string
  ) => Promise<string>;

  undeclareQueryable: (sessionId: string, queryableId: string) => Promise<void>;

  updateQueryableConfig: (
    queryableId: string,
    updates: Partial<Pick<ActiveQueryable, 'autoReply' | 'replyPayload' | 'replyEncoding'>>
  ) => void;

  replyInboundQuery: (
    token: string,
    keyExpr: string,
    payload: number[] | Uint8Array,
    encoding?: EncodingType | string
  ) => Promise<void>;

  clearExecutions: (sessionId?: string) => void;
  clearInboundQueries: (sessionId?: string) => void;
  selectExecution: (id: string | null) => void;
  setError: (error: string | null) => void;

  // Selectors / Helpers
  getQueryablesForSession: (sessionId: string) => ActiveQueryable[];
  getExecutionsForSession: (sessionId: string) => QueryExecution[];
  getInboundQueriesForSession: (sessionId: string) => InboundQuery[];
  getActiveExecution: () => QueryExecution | undefined;
}

export const useQueryStore = create<QueryState>((set, get) => ({
  activeQueryables: [],
  inboundQueries: [],
  executions: [],
  activeExecutionId: null,
  isListening: false,
  unlistenFn: null,
  error: null,

  initListener: async () => {
    if (get().isListening && get().unlistenFn) {
      return;
    }

    try {
      const unlisten = await onInboundQuery(async (inbound: InboundQuery) => {
        // Check if there is an active queryable matching queryable_id with autoReply enabled
        const matchingQueryable = get().activeQueryables.find(
          (q) => q.id === inbound.queryable_id && q.autoReply
        );

        if (matchingQueryable && matchingQueryable.replyPayload) {
          try {
            const bytes = encodeStringToBytes(matchingQueryable.replyPayload);
            const enc = matchingQueryable.replyEncoding || 'json';
            await replyQueryIpc(inbound.token, inbound.key_expr, bytes, enc);
            return; // Successfully auto-replied, no need to keep in pending list
          } catch (autoErr) {
            console.error('Auto-reply failed:', autoErr);
          }
        }

        // Add to pending inbound queries list
        set((state) => ({
          inboundQueries: [inbound, ...state.inboundQueries].slice(0, 500),
        }));
      });

      set({ isListening: true, unlistenFn: unlisten });
    } catch (err) {
      set({ error: `Failed to initialize inbound query listener: ${err}` });
    }
  },

  cleanupListener: () => {
    const unlisten = get().unlistenFn;
    if (unlisten) {
      unlisten();
    }
    set({ isListening: false, unlistenFn: null });
  },

  runQuery: async (
    sessionId: string,
    selector: string,
    target: QueryTarget | string = 'all',
    timeoutMs: number = 2000,
    profileId?: string
  ) => {
    const execId = generateId();
    const startedAt = Date.now();

    const execution: QueryExecution = {
      id: execId,
      sessionId,
      profileId,
      selector,
      target,
      timeoutMs,
      status: 'running',
      replies: [],
      startedAt,
    };

    set((state) => ({
      executions: [execution, ...state.executions],
      activeExecutionId: execId,
      error: null,
    }));

    try {
      const replies = await runQueryIpc(sessionId, selector, target, timeoutMs);
      const durationMs = Date.now() - startedAt;

      set((state) => ({
        executions: state.executions.map((e) =>
          e.id === execId
            ? { ...e, status: 'completed', replies, durationMs }
            : e
        ),
      }));

      return replies;
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMsg = String(err);

      set((state) => ({
        executions: state.executions.map((e) =>
          e.id === execId
            ? { ...e, status: 'error', error: errorMsg, durationMs }
            : e
        ),
        error: errorMsg,
      }));

      throw new Error(errorMsg);
    }
  },

  declareQueryable: async (
    sessionId: string,
    keyExpr: string,
    autoReply: boolean = false,
    replyPayload?: string,
    replyEncoding: EncodingType | string = 'json',
    profileId?: string
  ) => {
    set({ error: null });
    const queryableId = generateId();

    try {
      await declareQueryableIpc(sessionId, queryableId, keyExpr);

      const queryable: ActiveQueryable = {
        id: queryableId,
        sessionId,
        profileId,
        keyExpr,
        autoReply,
        replyPayload,
        replyEncoding,
        createdAt: Date.now(),
      };

      set((state) => ({
        activeQueryables: [...state.activeQueryables, queryable],
      }));

      // Ensure inbound listener is initialized
      if (!get().isListening) {
        await get().initListener();
      }

      return queryableId;
    } catch (err) {
      const msg = `Failed to declare queryable on '${keyExpr}': ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  undeclareQueryable: async (sessionId: string, queryableId: string) => {
    set({ error: null });
    try {
      await undeclareQueryableIpc(sessionId, queryableId);
      set((state) => ({
        activeQueryables: state.activeQueryables.filter((q) => q.id !== queryableId),
      }));
    } catch (err) {
      const msg = `Failed to undeclare queryable '${queryableId}': ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  updateQueryableConfig: (
    queryableId: string,
    updates: Partial<Pick<ActiveQueryable, 'autoReply' | 'replyPayload' | 'replyEncoding'>>
  ) => {
    set((state) => ({
      activeQueryables: state.activeQueryables.map((q) =>
        q.id === queryableId ? { ...q, ...updates } : q
      ),
    }));
  },

  replyInboundQuery: async (
    token: string,
    keyExpr: string,
    payload: number[] | Uint8Array,
    encoding: EncodingType | string = 'json'
  ) => {
    set({ error: null });
    try {
      await replyQueryIpc(token, keyExpr, payload, encoding);
      // Remove query with this token from pending list
      set((state) => ({
        inboundQueries: state.inboundQueries.filter((q) => q.token !== token),
      }));
    } catch (err) {
      const msg = `Failed to reply to inbound query: ${err}`;
      set({ error: msg });
      throw new Error(msg);
    }
  },

  clearExecutions: (sessionId?: string) => {
    set((state) => {
      if (sessionId) {
        return {
          executions: state.executions.filter((e) => e.sessionId !== sessionId),
          activeExecutionId:
            state.activeExecutionId &&
            state.executions.find((e) => e.id === state.activeExecutionId)?.sessionId === sessionId
              ? null
              : state.activeExecutionId,
        };
      }
      return { executions: [], activeExecutionId: null };
    });
  },

  clearInboundQueries: (sessionId?: string) => {
    set((state) => {
      if (sessionId) {
        return {
          inboundQueries: state.inboundQueries.filter((q) => q.session_id !== sessionId),
        };
      }
      return { inboundQueries: [] };
    });
  },

  selectExecution: (id: string | null) => {
    set({ activeExecutionId: id });
  },

  setError: (error: string | null) => set({ error }),

  getQueryablesForSession: (sessionId: string) => {
    return get().activeQueryables.filter((q) => q.sessionId === sessionId);
  },

  getExecutionsForSession: (sessionId: string) => {
    return get().executions.filter((e) => e.sessionId === sessionId);
  },

  getInboundQueriesForSession: (sessionId: string) => {
    return get().inboundQueries.filter((q) => q.session_id === sessionId);
  },

  getActiveExecution: () => {
    const activeId = get().activeExecutionId;
    return get().executions.find((e) => e.id === activeId);
  },
}));
