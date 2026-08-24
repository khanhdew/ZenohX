/**
 * Tauri IPC Client Bridge
 * Type-safe wrappers for Tauri commands and event listeners using @tauri-apps/api/core and @tauri-apps/api/event.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type {
  ConnectionProfile,
  EncodingType,
  InboundQuery,
  PutKind,
  QueryConsolidation,
  QueryTarget,
  ReplySample,

  ScoutedNode,
  QueryablePreset,
  SessionConfig,
  SessionInfo,
  SessionStatusEvent,
  StoredMessage,
  StoredQueryExecution,
  SubscriptionPreset,
  ZenohSample,
} from '../types/zenoh';

// ============================================================================
// Helpers
// ============================================================================

function normalizePayload(payload: number[] | Uint8Array): number[] {
  return payload instanceof Uint8Array ? Array.from(payload) : payload;
}

// ============================================================================
// Session & Discovery IPC Commands
// ============================================================================

/**
 * Connects to a Zenoh network with the provided configuration.
 * @returns The generated session UUID string.
 */
export async function connectSession(config: SessionConfig): Promise<string> {
  return invoke<string>('connect_session', { config });
}

/**
 * Disconnects and closes an active Zenoh session.
 */
export async function disconnectSession(sessionId: string): Promise<void> {
  return invoke<void>('disconnect_session', { sessionId });
}

/**
 * Scans the local network for Zenoh routers and peers using multicast scouting.
 * @param timeoutMs Timeout in milliseconds (default: 3000ms).
 */
export async function scoutNodes(timeoutMs: number = 3000): Promise<ScoutedNode[]> {
  return invoke<ScoutedNode[]>('scout_locators', { timeoutMs });
}

/**
 * Retrieves metadata for a specific active session.
 */
export async function getSessionInfo(sessionId: string): Promise<SessionInfo> {
  return invoke<SessionInfo>('get_session_info', { sessionId });
}

/**
 * Retrieves metadata for all active Zenoh sessions.
 */
export async function getAllSessions(): Promise<SessionInfo[]> {
  return invoke<SessionInfo[]>('get_all_sessions');
}

// ============================================================================
// Pub/Sub IPC Commands
// ============================================================================

/**
 * Publishes a data sample or delete signal to a Zenoh key expression with optional QoS.
 */
export async function publishSample(
  sessionId: string,
  keyExpr: string,
  payload: number[] | Uint8Array,
  encoding: EncodingType | string = 'json',
  kind: PutKind | string = 'put',
  options?: PublishOptions | null
): Promise<void> {
  if (options && Object.keys(options).length > 0) {
    return invoke<void>('publish_sample_advanced', {
      sessionId,
      keyExpr,
      payload: normalizePayload(payload),
      encoding,
      kind,
      options,
    });
  }
  return invoke<void>('publish_sample', {
    sessionId,
    keyExpr,
    payload: normalizePayload(payload),
    encoding,
    kind,
  });
}

/**
 * Declares a subscriber on the specified session with optional reliability/origin options.
 * Incoming samples will be streamed to `zenohx://samples-batched` and `zenohx://sample` events.
 */
export async function subscribeKey(
  sessionId: string,
  subId: string,
  keyExpr: string,
  options?: SubscribeOptions | null
): Promise<void> {
  if (options && Object.keys(options).length > 0) {
    return invoke<void>('subscribe_advanced', { sessionId, subId, keyExpr, options });
  }
  return invoke<void>('subscribe', { sessionId, subId, keyExpr });
}

/**
 * Unsubscribes an active subscriber by its subId.
 */
export async function unsubscribeKey(
  sessionId: string,
  subId: string
): Promise<void> {
  return invoke<void>('unsubscribe', { sessionId, subId });
}

/**
 * Starts a background stream generator in Rust.
 */
export async function startStreamGenerator(
  config: StreamGeneratorConfig
): Promise<void> {
  return invoke<void>('start_stream_generator', { config });
}

/**
 * Stops an active background stream generator in Rust.
 */
export async function stopStreamGenerator(
  generatorId: string
): Promise<void> {
  return invoke<void>('stop_stream_generator', { generatorId });
}

// ============================================================================
// Query & Queryable (RPC) IPC Commands
// ============================================================================

/**
 * Executes a distributed Zenoh query (`session.get`) and returns all collected replies.
 */
export async function runQuery(
  sessionId: string,
  selector: string,
  target: QueryTarget | string = 'all',
  timeoutMs: number = 2000,
  payload?: number[] | Uint8Array | null,
  encoding?: EncodingType | string | null,
  consolidation?: QueryConsolidation | string | null
): Promise<ReplySample[]> {
  return invoke<ReplySample[]>('query_get', {
    sessionId,
    selector,
    target,
    timeoutMs,
    payload: payload ? normalizePayload(payload) : undefined,
    encoding: encoding || undefined,
    consolidation: consolidation && consolidation !== 'auto' ? consolidation : undefined,
  });
}


/**
 * Declares a queryable on a Zenoh session.
 * Inbound queries will be streamed to `zenohx://query` event.
 */
export async function declareQueryable(
  sessionId: string,
  queryableId: string,
  keyExpr: string
): Promise<void> {
  return invoke<void>('declare_queryable', {
    sessionId,
    queryableId,
    keyExpr,
  });
}

/**
 * Undeclares an active queryable and terminates its background listener.
 */
export async function undeclareQueryable(
  sessionId: string,
  queryableId: string
): Promise<void> {
  return invoke<void>('undeclare_queryable', {
    sessionId,
    queryableId,
  });
}

/**
 * Responds to a pending inbound query identified by its unique token.
 */
export async function replyQuery(
  token: string,
  keyExpr: string,
  payload: number[] | Uint8Array,
  encoding: EncodingType | string = 'json'
): Promise<void> {
  return invoke<void>('reply_query', {
    token,
    keyExpr,
    payload: normalizePayload(payload),
    encoding,
  });
}

// ============================================================================
// Profile & Message Persistence IPC Commands
// ============================================================================

/**
 * Saves or updates a connection profile in the SQLite database.
 */
export async function saveProfile(profile: ConnectionProfile): Promise<void> {
  return invoke<void>('save_profile', { profile });
}

/**
 * Loads all connection profiles saved in SQLite.
 */
export async function loadProfiles(): Promise<ConnectionProfile[]> {
  return invoke<ConnectionProfile[]>('load_profiles');
}

/**
 * Deletes a connection profile by its ID from SQLite.
 */
export async function deleteProfile(profileId: string): Promise<void> {
  return invoke<void>('delete_profile', { profileId });
}

/**
 * Saves or updates a subscription preset in SQLite.
 */
export async function saveSubscriptionPreset(preset: SubscriptionPreset): Promise<void> {
  return invoke<void>('save_subscription_preset', { preset });
}

/**
 * Loads all subscription presets for a profile from SQLite.
 */
export async function loadSubscriptionPresets(profileId?: string): Promise<SubscriptionPreset[]> {
  return invoke<SubscriptionPreset[]>('load_subscription_presets', {
    profileId: profileId && profileId !== '__all__' ? profileId : undefined,
  });
}

/**
 * Deletes a subscription preset by its ID from SQLite.
 */
export async function deleteSubscriptionPreset(presetId: string): Promise<void> {
  return invoke<void>('delete_subscription_preset', { presetId });
}

/**
 * Queries message history for a profile (or all profiles) with pagination.
 */
export async function queryMessages(
  profileId?: string,
  limit: number = 100,
  offset: number = 0
): Promise<StoredMessage[]> {
  return invoke<StoredMessage[]>('query_messages', {
    profileId: profileId && profileId !== '__all__' ? profileId : undefined,
    limit,
    offset,
  });
}

/**
 * Saves a message directly into SQLite message history.
 */
export async function saveMessage(message: StoredMessage): Promise<number> {
  return invoke<number>('save_message', { message });
}

/**
 * Clears message history for a specific profile or all profiles.
 */
export async function clearMessageHistory(profileId?: string): Promise<void> {
  return invoke<void>('clear_message_history', {
    profileId: profileId && profileId !== '__all__' ? profileId : undefined,
  });
}

/**
 * Deletes a single message by its row ID.
 */
export async function deleteMessage(messageId: number): Promise<void> {
  return invoke<void>('delete_message', { messageId });
}

/**
 * Saves or updates a queryable preset in SQLite.
 */
export async function saveQueryablePreset(preset: QueryablePreset): Promise<void> {
  return invoke<void>('save_queryable_preset', { preset });
}

/**
 * Loads all queryable presets for a profile from SQLite.
 */
export async function loadQueryablePresets(profileId?: string): Promise<QueryablePreset[]> {
  return invoke<QueryablePreset[]>('load_queryable_presets', {
    profileId: profileId && profileId !== '__all__' ? profileId : undefined,
  });
}

/**
 * Deletes a queryable preset by ID from SQLite.
 */
export async function deleteQueryablePreset(presetId: string): Promise<void> {
  return invoke<void>('delete_queryable_preset', { presetId });
}

/**
 * Saves a query execution record to SQLite.
 */
export async function saveQueryExecution(execution: StoredQueryExecution): Promise<void> {
  return invoke<void>('save_query_execution', { execution });
}

/**
 * Queries query execution history from SQLite with pagination.
 */
export async function loadQueryHistory(
  profileId?: string,
  limit: number = 50,
  offset: number = 0
): Promise<StoredQueryExecution[]> {
  return invoke<StoredQueryExecution[]>('load_query_history', {
    profileId: profileId && profileId !== '__all__' ? profileId : undefined,
    limit,
    offset,
  });
}

/**
 * Clears query execution history from SQLite.
 */
export async function clearQueryHistory(profileId?: string): Promise<void> {
  return invoke<void>('clear_query_history', {
    profileId: profileId && profileId !== '__all__' ? profileId : undefined,
  });
}

/**
 * Deletes a specific query execution from SQLite.
 */
export async function deleteQueryExecution(executionId: string): Promise<void> {
  return invoke<void>('delete_query_execution', { executionId });
}

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Subscribes to real-time incoming Zenoh samples emitted by backend subscribers.
 */
export async function onZenohSample(
  callback: (sample: ZenohSample) => void
): Promise<UnlistenFn> {
  return listen<ZenohSample>('zenohx://sample', (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribes to high-throughput batched Zenoh samples (frame-rate aligned).
 */
export async function onZenohSamplesBatched(
  callback: (samples: ZenohSample[]) => void
): Promise<UnlistenFn> {
  return listen<ZenohSample[]>('zenohx://samples-batched', (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribes to inbound query requests received by declared queryables.
 */
export async function onInboundQuery(
  callback: (query: InboundQuery) => void
): Promise<UnlistenFn> {
  return listen<InboundQuery>('zenohx://query', (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribes to session status notifications.
 */
export async function onSessionStatus(
  callback: (status: SessionStatusEvent) => void
): Promise<UnlistenFn> {
  return listen<SessionStatusEvent>('zenohx://session-status', (event) => {
    callback(event.payload);
  });
}

/**
 * Opens a dedicated desktop window for a specific connection profile.
 */
export async function openProfileInNewWindow(profile: ConnectionProfile): Promise<void> {
  const cleanId = profile.id.replace(/[^a-zA-Z0-9-_]/g, '');
  const windowLabel = `zenohx-win-${cleanId}-${Date.now()}`;
  try {
    const webview = new WebviewWindow(windowLabel, {
      url: `index.html?profileId=${encodeURIComponent(profile.id)}`,
      title: `ZenohX - ${profile.name}`,
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      center: true,
    });

    webview.once('tauri://error', (e) => {
      console.warn('WebviewWindow creation error, falling back:', e);
      if (typeof window !== 'undefined') {
        window.open(`/?profileId=${encodeURIComponent(profile.id)}`, '_blank');
      }
    });
  } catch (err) {
    console.warn('Failed to invoke WebviewWindow, fallback to window.open:', err);
    if (typeof window !== 'undefined') {
      window.open(`/?profileId=${encodeURIComponent(profile.id)}`, '_blank');
    }
  }
}

