/**
 * Tauri IPC Client Bridge
 * Type-safe wrappers for Tauri commands and event listeners using @tauri-apps/api/core and @tauri-apps/api/event.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ConnectionProfile,
  EncodingType,
  InboundQuery,
  PutKind,
  QueryTarget,
  ReplySample,
  ScoutedNode,
  SessionConfig,
  SessionInfo,
  StoredMessage,
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
 * Publishes a data sample or delete signal to a Zenoh key expression.
 */
export async function publishSample(
  sessionId: string,
  keyExpr: string,
  payload: number[] | Uint8Array,
  encoding: EncodingType | string = 'json',
  kind: PutKind | string = 'put'
): Promise<void> {
  return invoke<void>('publish_sample', {
    sessionId,
    keyExpr,
    payload: normalizePayload(payload),
    encoding,
    kind,
  });
}

/**
 * Declares a subscriber on the specified session.
 * Incoming samples will be streamed to `zenohx://sample` event.
 */
export async function subscribeKey(
  sessionId: string,
  subId: string,
  keyExpr: string
): Promise<void> {
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
  timeoutMs: number = 2000
): Promise<ReplySample[]> {
  return invoke<ReplySample[]>('query_get', {
    sessionId,
    selector,
    target,
    timeoutMs,
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
 * Queries message history for a profile with pagination.
 */
export async function queryMessages(
  profileId: string,
  limit: number = 100,
  offset: number = 0
): Promise<StoredMessage[]> {
  return invoke<StoredMessage[]>('query_messages', {
    profileId,
    limit,
    offset,
  });
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
  callback: (status: unknown) => void
): Promise<UnlistenFn> {
  return listen<unknown>('zenohx://session-status', (event) => {
    callback(event.payload);
  });
}
