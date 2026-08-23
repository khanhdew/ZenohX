/**
 * Query & RPC Store (Zustand)
 * Manages distributed query executions, multi-reply timelines, declared queryables, and inbound query replies.
 */

import { create } from 'zustand';
import type {
  ActiveQueryable,
  QueryableReplyMode,
  EncodingType,
  InboundQuery,
  QueryConsolidation,
  QueryExecution,
  QueryTarget,
  ReplySample,
} from '../types/zenoh';

import {
  clearQueryHistory as clearQueryHistoryIpc,
  declareQueryable as declareQueryableIpc,
  deleteQueryExecution as deleteQueryExecutionIpc,
  deleteQueryablePreset as deleteQueryablePresetIpc,
  loadQueryHistory as loadQueryHistoryIpc,
  loadQueryablePresets as loadQueryablePresetsIpc,
  onInboundQuery,
  replyQuery as replyQueryIpc,
  runQuery as runQueryIpc,
  saveQueryExecution as saveQueryExecutionIpc,
  saveQueryablePreset as saveQueryablePresetIpc,
  undeclareQueryable as undeclareQueryableIpc,
} from '../lib/tauri';
import { formatFriendlyError } from '../lib/errorUtils';
import { executeInboundScript } from '../lib/scriptRunner';
import { useConnectionStore } from './connectionStore';
import { useTrafficStore } from './trafficStore';
import type { UnlistenFn } from '@tauri-apps/api/event';


function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'query-' + Math.random().toString(36).substring(2, 9);
}

function encodeStringToBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
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
    profileId?: string,
    payload?: number[] | Uint8Array | null,
    encoding?: EncodingType | string | null,
    consolidation?: QueryConsolidation | string | null
  ) => Promise<ReplySample[]>;


  declareQueryable: (
    sessionId: string,
    keyExpr: string,
    autoReply?: boolean,
    replyPayload?: string,
    replyEncoding?: EncodingType | string,
    profileId?: string,
    replyMode?: QueryableReplyMode,
    scriptCode?: string
  ) => Promise<string>;

  undeclareQueryable: (sessionId: string, queryableId: string) => Promise<void>;

  editQueryable: (
    queryableId: string,
    updates: {
      keyExpr?: string;
      autoReply?: boolean;
      replyMode?: QueryableReplyMode;
      replyPayload?: string;
      replyEncoding?: EncodingType | string;
      scriptCode?: string;
    }
  ) => Promise<void>;

  updateQueryableConfig: (
    queryableId: string,
    updates: Partial<
      Pick<
        ActiveQueryable,
        'autoReply' | 'replyPayload' | 'replyEncoding' | 'replyMode' | 'scriptCode' | 'keyExpr'
      >
    >
  ) => void;

  replyInboundQuery: (
    token: string,
    keyExpr: string,
    payload: number[] | Uint8Array,
    encoding?: EncodingType | string
  ) => Promise<void>;

  dismissInboundQuery: (token: string) => void;

  loadQueryHistory: (profileId?: string, limit?: number, offset?: number) => Promise<void>;
  loadQueryables: (profileId: string, activeSessionId?: string) => Promise<void>;
  clearExecutions: (sessionId?: string, profileId?: string) => Promise<void>;
  clearInboundQueries: (sessionId?: string) => void;
  deleteExecution: (executionId: string) => Promise<void>;
  selectExecution: (id: string | null) => void;
  setError: (error: string | null) => void;

  // Selectors / Helpers
  getQueryablesForSession: (sessionId: string) => ActiveQueryable[];
  getExecutionsForSession: (sessionId: string) => QueryExecution[];
  getInboundQueriesForSession: (sessionId: string) => InboundQuery[];
  getActiveExecution: () => QueryExecution | undefined;
}

let isInitializingQueryListener = false;


export const useQueryStore = create<QueryState>((set, get) => ({
  activeQueryables: [],
  inboundQueries: [],
  executions: [],
  activeExecutionId: null,
  isListening: false,
  unlistenFn: null,
  error: null,

  initListener: async () => {
    if (get().isListening || isInitializingQueryListener) {
      return;
    }
    isInitializingQueryListener = true;

    try {
      if (get().unlistenFn) {
        get().unlistenFn?.();
        set({ unlistenFn: null, isListening: false });
      }

      const unlisten = await onInboundQuery(async (inbound: InboundQuery) => {
        useTrafficStore.getState().recordEvent({
          sessionId: inbound.session_id,
          direction: 'inbound',
          opType: 'queryable_in',
          keyExpr: inbound.key_expr,
          bytes: inbound.parameters?.length || 0,
        });

        // Check if there is an active queryable matching queryable_id or keyExpr with autoReply enabled
        const matchingQueryable = get().activeQueryables.find(
          (q) => (q.id === inbound.queryable_id || q.keyExpr === inbound.key_expr) && q.autoReply
        );

        if (matchingQueryable) {
          try {
            let bytes: number[] = [];
            let enc = matchingQueryable.replyEncoding || 'json';
            let replyKey = matchingQueryable.keyExpr || inbound.key_expr;

            if (matchingQueryable.replyMode === 'script' && matchingQueryable.scriptCode) {
              const scriptRes = await executeInboundScript(
                matchingQueryable.scriptCode,
                inbound,
                enc
              );
              bytes = scriptRes.bytes;
              enc = scriptRes.encoding;
              if (scriptRes.keyExpr) {
                replyKey = scriptRes.keyExpr;
              }
            } else {
              const replyText =
                matchingQueryable.replyPayload !== undefined
                  ? matchingQueryable.replyPayload
                  : '{"status":"ok"}';
              bytes = encodeStringToBytes(replyText);
            }

            await replyQueryIpc(inbound.token, replyKey, bytes, enc);
            useTrafficStore.getState().recordEvent({
              sessionId: inbound.session_id,
              profileId: matchingQueryable.profileId,
              direction: 'outbound',
              opType: 'queryable_out',
              keyExpr: replyKey,
              bytes: bytes.length,
            });
          } catch (autoErr) {
            console.error('Auto-reply failed:', autoErr);
          }
          // When autoReply is enabled on the matching queryable, do NOT add to pending manual queue
          return;
        }


        // Add to pending inbound queries list for manual response (deduplicate by token)
        set((state) => {
          if (state.inboundQueries.some((q) => q.token === inbound.token)) {
            return state;
          }
          return {
            inboundQueries: [inbound, ...state.inboundQueries].slice(0, 500),
          };
        });
      });

      set({ isListening: true, unlistenFn: unlisten });
    } catch (err) {
      set({ error: `Failed to initialize inbound query listener: ${err}` });
    } finally {
      isInitializingQueryListener = false;
    }
  },

  cleanupListener: () => {
    const unlisten = get().unlistenFn;
    if (unlisten) {
      unlisten();
    }
    set({ isListening: false, unlistenFn: null });
    isInitializingQueryListener = false;
  },


  runQuery: async (
    sessionId: string,
    selector: string,
    target: QueryTarget | string = 'all',
    timeoutMs: number = 2000,
    profileId?: string,
    payload?: number[] | Uint8Array | null,
    encoding?: EncodingType | string | null,
    consolidation?: QueryConsolidation | string | null
  ) => {
    const execId = generateId();
    const startedAt = Date.now();
    const targetProfileId =
      profileId || useConnectionStore.getState().sessionToProfile[sessionId] || '';

    const payloadBytes = payload
      ? payload instanceof Uint8Array
        ? Array.from(payload)
        : payload
      : undefined;

    const execution: QueryExecution = {
      id: execId,
      sessionId,
      profileId: targetProfileId,
      selector,
      target,
      consolidation: consolidation || undefined,
      timeoutMs,
      requestPayload: payloadBytes,
      requestEncoding: encoding || undefined,
      status: 'running',
      replies: [],
      startedAt,
    };

    useTrafficStore.getState().recordEvent({
      sessionId,
      profileId: targetProfileId,
      direction: 'outbound',
      opType: 'query_req',
      keyExpr: selector,
      bytes: selector.length + (payloadBytes?.length || 0),
    });

    set((state) => ({
      executions: [execution, ...state.executions],
      activeExecutionId: execId,
      error: null,
    }));

    try {
      const replies = await runQueryIpc(
        sessionId,
        selector,
        target,
        timeoutMs,
        payload,
        encoding,
        consolidation
      );
      const durationMs = Date.now() - startedAt;


      for (const r of replies) {
        useTrafficStore.getState().recordEvent({
          sessionId: r.session_id || sessionId,
          profileId: targetProfileId,
          direction: 'inbound',
          opType: 'query_res',
          keyExpr: r.key_expr,
          bytes: r.payload?.length || 0,
        });
      }

      // Save execution history in SQLite

      saveQueryExecutionIpc({
        id: execId,
        profile_id: targetProfileId || null,
        selector,
        target: String(target),
        timeout_ms: timeoutMs,
        status: 'completed',
        replies_json: JSON.stringify(replies),
        duration_ms: durationMs,
        error: null,
        timestamp: startedAt,
      }).catch(() => {});

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
      console.error('Query execution failed:', err);
      const friendly = formatFriendlyError(err, 'Query Failed').fullMessage;

      // Save failed execution in SQLite
      saveQueryExecutionIpc({
        id: execId,
        profile_id: targetProfileId || null,
        selector,
        target: String(target),
        timeout_ms: timeoutMs,
        status: 'error',
        replies_json: '[]',
        duration_ms: durationMs,
        error: friendly,
        timestamp: startedAt,
      }).catch(() => {});

      set((state) => ({
        executions: state.executions.map((e) =>
          e.id === execId
            ? { ...e, status: 'error', error: friendly, durationMs }
            : e
        ),
        error: friendly,
      }));

      throw new Error(friendly);
    }
  },

  declareQueryable: async (
    sessionId: string,
    keyExpr: string,
    autoReply: boolean = false,
    replyPayload?: string,
    replyEncoding: EncodingType | string = 'json',
    profileId?: string,
    replyMode: QueryableReplyMode = 'payload',
    scriptCode?: string
  ) => {
    set({ error: null });
    const queryableId = generateId();
    const targetProfileId =
      profileId || useConnectionStore.getState().sessionToProfile[sessionId] || '';

    try {
      if (sessionId) {
        await declareQueryableIpc(sessionId, queryableId, keyExpr);
      }

      const queryable: ActiveQueryable = {
        id: queryableId,
        sessionId: sessionId || '',
        profileId: targetProfileId,
        keyExpr,
        autoReply,
        replyMode,
        replyPayload,
        scriptCode,
        replyEncoding,
        createdAt: Date.now(),
      };

      // Persist as SQLite queryable preset
      if (targetProfileId) {
        saveQueryablePresetIpc({
          id: queryableId,
          profile_id: targetProfileId,
          key_expr: keyExpr,
          auto_reply: autoReply,
          reply_payload:
            replyMode === 'script' ? scriptCode || null : replyPayload || null,
          reply_encoding: replyMode === 'script' ? 'script' : replyEncoding,
        }).catch(() => {});
      }

      set((state) => ({
        activeQueryables: [
          ...state.activeQueryables.filter((q) => q.id !== queryableId),
          queryable,
        ],
      }));

      // Ensure inbound listener is initialized if online
      if (sessionId && !get().isListening) {
        await get().initListener();
      }

      return queryableId;
    } catch (err) {
      console.error('Declare queryable failed:', err);
      const friendly = formatFriendlyError(err, 'Queryable Declaration').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  undeclareQueryable: async (sessionId: string, queryableId: string) => {
    set({ error: null });
    try {
      if (sessionId) {
        try {
          await undeclareQueryableIpc(sessionId, queryableId);
        } catch {
          // Ignore
        }
      }

      try {
        await deleteQueryablePresetIpc(queryableId);
      } catch {
        // Ignore
      }

      set((state) => ({
        activeQueryables: state.activeQueryables.filter((q) => q.id !== queryableId),
      }));
    } catch (err) {
      console.error('Undeclare queryable failed:', err);
      const friendly = formatFriendlyError(err, 'Undeclare Queryable').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  editQueryable: async (queryableId, updates) => {
    set({ error: null });
    const current = get().activeQueryables.find((q) => q.id === queryableId);
    if (!current) return;

    const keyChanged = Boolean(updates.keyExpr && updates.keyExpr !== current.keyExpr);

    try {
      if (keyChanged && current.sessionId) {
        try {
          await undeclareQueryableIpc(current.sessionId, queryableId);
        } catch {
          // Ignore
        }
        await declareQueryableIpc(current.sessionId, queryableId, updates.keyExpr!);
      }

      const next: ActiveQueryable = {
        ...current,
        ...updates,
        keyExpr: updates.keyExpr || current.keyExpr,
      };

      if (next.profileId) {
        const isScript = next.replyMode === 'script';
        await saveQueryablePresetIpc({
          id: next.id,
          profile_id: next.profileId,
          key_expr: next.keyExpr,
          auto_reply: next.autoReply,
          reply_payload:
            isScript ? next.scriptCode || null : next.replyPayload || null,
          reply_encoding: isScript ? 'script' : next.replyEncoding || 'json',
        });
      }

      set((state) => ({
        activeQueryables: state.activeQueryables.map((q) =>
          q.id === queryableId ? next : q
        ),
      }));
    } catch (err) {
      console.error('Edit queryable failed:', err);
      const friendly = formatFriendlyError(err, 'Edit Queryable').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  updateQueryableConfig: (
    queryableId: string,
    updates: Partial<
      Pick<
        ActiveQueryable,
        'autoReply' | 'replyPayload' | 'replyEncoding' | 'replyMode' | 'scriptCode' | 'keyExpr'
      >
    >
  ) => {
    set((state) => {
      const updated = state.activeQueryables.map((q) => {
        if (q.id === queryableId) {
          const next = { ...q, ...updates };
          if (next.profileId) {
            const isScript = next.replyMode === 'script';
            saveQueryablePresetIpc({
              id: next.id,
              profile_id: next.profileId,
              key_expr: next.keyExpr,
              auto_reply: next.autoReply,
              reply_payload:
                isScript ? next.scriptCode || null : next.replyPayload || null,
              reply_encoding: isScript ? 'script' : next.replyEncoding || 'json',
            }).catch(() => {});
          }
          return next;
        }
        return q;
      });
      return { activeQueryables: updated };
    });
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
      const payloadLength =
        payload instanceof Uint8Array ? payload.length : (payload ? payload.length : 0);
      useTrafficStore.getState().recordEvent({
        direction: 'outbound',
        opType: 'queryable_out',
        keyExpr,
        bytes: payloadLength,
      });
      // Remove query with this token from pending list
      set((state) => ({
        inboundQueries: state.inboundQueries.filter((q) => q.token !== token),
      }));
    } catch (err) {
      console.error('Reply query failed:', err);
      // Remove query from pending list on error as well (e.g., already replied or expired on backend)
      set((state) => ({
        inboundQueries: state.inboundQueries.filter((q) => q.token !== token),
      }));

      const friendly = formatFriendlyError(err, 'Query Reply').fullMessage;
      set({ error: friendly });
      throw new Error(friendly);
    }
  },

  dismissInboundQuery: (token: string) => {
    set((state) => ({
      inboundQueries: state.inboundQueries.filter((q) => q.token !== token),
    }));
  },

  loadQueryHistory: async (profileId?: string, limit: number = 50, offset: number = 0) => {
    try {
      const stored = await loadQueryHistoryIpc(profileId, limit, offset);
      const mapped: QueryExecution[] = stored.map((s) => {
        let replies: ReplySample[] = [];
        try {
          replies = JSON.parse(s.replies_json);
        } catch {
          replies = [];
        }
        return {
          id: s.id,
          sessionId: '',
          profileId: s.profile_id || undefined,
          selector: s.selector,
          target: (s.target as QueryTarget) || 'all',
          timeoutMs: s.timeout_ms,
          status: (s.status as QueryExecution['status']) || 'completed',
          replies,
          startedAt: s.timestamp,
          durationMs: s.duration_ms ?? undefined,
          error: s.error,
        };
      });

      set((state) => {
        const combined = [...state.executions, ...mapped];
        const seen = new Set<string>();
        const unique = combined.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        unique.sort((a, b) => b.startedAt - a.startedAt);
        return { executions: unique };
      });
    } catch (err) {
      console.error('Load query history failed:', err);
      const friendly = formatFriendlyError(err, 'Query History').fullMessage;
      set({ error: friendly });
    }
  },

  loadQueryables: async (profileId: string, activeSessionId?: string) => {
    if (!profileId) return;
    try {
      const presets = await loadQueryablePresetsIpc(profileId);
      const current = get().activeQueryables;
      const loaded: ActiveQueryable[] = [];

      for (const preset of presets) {
        const existing = current.find((q) => q.id === preset.id || q.keyExpr === preset.key_expr);

        if (activeSessionId) {
          try {
            await declareQueryableIpc(activeSessionId, preset.id, preset.key_expr);
          } catch {
            // Ignore if declare fails
          }
        }

        const isScript = preset.reply_encoding === 'script';
        loaded.push({
          id: preset.id,
          sessionId: activeSessionId || existing?.sessionId || '',
          profileId: preset.profile_id,
          keyExpr: preset.key_expr,
          autoReply: preset.auto_reply,
          replyMode: isScript ? 'script' : existing?.replyMode || 'payload',
          replyPayload: !isScript ? preset.reply_payload || undefined : undefined,
          scriptCode: isScript ? preset.reply_payload || undefined : existing?.scriptCode,
          replyEncoding: isScript ? 'json' : preset.reply_encoding,
          createdAt: existing?.createdAt || Date.now(),
        });
      }

      if (loaded.length > 0 && activeSessionId && !get().isListening) {
        await get().initListener();
      }

      set((state) => {
        const other = state.activeQueryables.filter(
          (q) => q.profileId && q.profileId !== profileId
        );
        return { activeQueryables: [...other, ...loaded] };
      });
    } catch (err) {
      console.error('Load queryables failed:', err);
      const friendly = formatFriendlyError(err, 'Load Queryables').fullMessage;
      set({ error: friendly });
    }
  },

  clearExecutions: async (sessionId?: string, profileId?: string) => {
    set((state) => {
      if (sessionId || profileId) {
        const filtered = state.executions.filter((e) => {
          if (sessionId && e.sessionId === sessionId) return false;
          if (profileId && e.profileId === profileId) return false;
          return true;
        });
        return {
          executions: filtered,
          activeExecutionId:
            (sessionId && state.executions.find((e) => e.id === state.activeExecutionId)?.sessionId === sessionId) ||
            (profileId && state.executions.find((e) => e.id === state.activeExecutionId)?.profileId === profileId)
              ? null
              : state.activeExecutionId,
        };
      }
      return { executions: [], activeExecutionId: null };
    });

    try {
      await clearQueryHistoryIpc(profileId);
    } catch {
      // Ignore
    }
  },

  deleteExecution: async (executionId: string) => {
    set((state) => ({
      executions: state.executions.filter((e) => e.id !== executionId),
      activeExecutionId:
        state.activeExecutionId === executionId ? null : state.activeExecutionId,
    }));

    try {
      await deleteQueryExecutionIpc(executionId);
    } catch {
      // Ignore
    }
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
