/**
 * ZenohX Core TypeScript Types & DTO Definitions
 * Matches Tauri backend models and IPC payload structures.
 */

// ============================================================================
// Enums & Primitive Unions
// ============================================================================

export type ConnectionMode = 'peer' | 'client' | 'router';

export type EncodingType = 'json' | 'cbor' | 'text' | 'raw' | 'protobuf';

export type PutKind = 'put' | 'delete';

export type MessageDirection = 'incoming' | 'outgoing';

export type QueryTarget = 'all' | 'complete' | 'best_matching';

export type QueryConsolidation = 'auto' | 'none' | 'latest' | 'monotonic';

export type QueryStatus = 'idle' | 'running' | 'completed' | 'error';


// ============================================================================
// Backend Configuration & DTO Models
// ============================================================================

/**
 * User authentication credentials for Zenoh transports.
 */
export interface UserAuth {
  username?: string;
  password?: string;
  token?: string;
}

/**
 * TLS / Certificate configurations for secure Zenoh links.
 */
export interface TlsConfig {
  ca_cert?: string;
  client_cert?: string;
  client_key?: string;
}

/**
 * Low-level configuration for opening a Zenoh session.
 */
export interface SessionConfig {
  profile_id?: string;
  mode: ConnectionMode | string;
  connect_locators: string[];
  listen_locators: string[];
  scout_multicast: boolean;
  user_auth?: UserAuth | null;
  tls_config?: TlsConfig | null;
  custom_config?: Record<string, unknown> | null;
}

/**
 * Saved connection profile in SQLite database.
 */
export interface ConnectionProfile {
  id: string;
  name: string;
  mode: ConnectionMode | string;
  connect_locators: string[];
  listen_locators: string[];
  scout_multicast: boolean;
  user_auth?: UserAuth | null;
  tls_config?: TlsConfig | null;
  custom_config?: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
}

/**
 * Subscription preset linked to a connection profile.
 */
export interface SubscriptionPreset {
  id: string;
  profile_id: string;
  key_expr: string;
  default_encoding: EncodingType | string;
  auto_subscribe: boolean;
  color_tag?: string | null;
}

/**
 * Queryable preset linked to a connection profile.
 */
export interface QueryablePreset {
  id: string;
  profile_id: string;
  key_expr: string;
  auto_reply: boolean;
  reply_payload?: string | null;
  reply_encoding: EncodingType | string;
}

/**
 * Stored query execution history in SQLite.
 */
export interface StoredQueryExecution {
  id: string;
  profile_id?: string | null;
  selector: string;
  target: string;
  timeout_ms: number;
  status: string;
  replies_json: string;
  duration_ms?: number | null;
  error?: string | null;
  timestamp: number;
}

/**
 * Stored message in SQLite persistence history.
 */
export interface StoredMessage {
  id?: number | null;
  profile_id: string;
  direction: MessageDirection | string;
  key_expr: string;
  payload: number[];
  encoding: EncodingType | string;
  kind: PutKind | string;
  timestamp: number;
}

/**
 * Information on an active Zenoh session returned by backend.
 */
export interface SessionInfo {
  id: string;
  profile_id?: string | null;
  zid: string;
  mode: ConnectionMode | string;
  scout_multicast: boolean;
  connect_locators: string[];
  listen_locators: string[];
  created_at: number;
}

/**
 * A Zenoh peer or router discovered via multicast scouting.
 */
export interface ScoutedNode {
  zid: string;
  what: string;
  locators: string[];
}

/**
 * Real-time streaming sample received from a subscriber.
 */
export interface ZenohSample {
  session_id: string;
  sub_id?: string | null;
  key_expr: string;
  payload: number[];
  encoding: EncodingType | string;
  kind: PutKind | string;
  timestamp: number;
}

/**
 * Response sample returned from a distributed query (`session.get`).
 */
export interface ReplySample {
  session_id: string;
  key_expr: string;
  payload: number[];
  encoding: EncodingType | string;
  replier_id?: string | null;
  latency_ms: number;
  timestamp: number;
  is_err: boolean;
  error_message?: string | null;
}

/**
 * Inbound query received by a declared queryable.
 */
export interface InboundQuery {
  token: string;
  session_id: string;
  queryable_id: string;
  key_expr: string;
  parameters: string;
  payload?: number[] | null;
  encoding?: string | null;
  timestamp: number;
}

/**
 * Queryable metadata returned by backend.
 */
export interface QueryableInfo {
  id: string;
  session_id: string;
  key_expr: string;
  created_at: number;
}

/**
 * Event payload emitted when session connection status changes.
 */
export interface SessionStatusEvent {
  sessionId: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  error?: string;
  timestamp?: number;
}

// ============================================================================
// Frontend State & Workspace Types
// ============================================================================

/**
 * Active subscription tracked in frontend state.
 */
export interface SubscriptionItem {
  id: string;
  sessionId: string;
  profileId?: string;
  keyExpr: string;
  encoding: EncodingType | string;
  colorTag?: string;
  count: number;
  active: boolean;
  createdAt: number;
}

/**
 * Message item displayed in the virtualized pub/sub message feed.
 */
export interface MessageItem {
  id: string;
  sessionId: string;
  profileId?: string;
  subId?: string | null;
  direction: MessageDirection;
  keyExpr: string;
  payload: number[];
  encoding: EncodingType | string;
  kind: PutKind | string;
  timestamp: number;
}

export type QueryableReplyMode = 'payload' | 'script';

/**
 * Active queryable declared in the frontend RPC workspace.
 */
export interface ActiveQueryable {
  id: string;
  sessionId: string;
  profileId?: string;
  keyExpr: string;
  autoReply: boolean;
  replyMode?: QueryableReplyMode;
  replyPayload?: string;
  scriptCode?: string;
  replyEncoding?: EncodingType | string;
  createdAt: number;
}

/**
 * History record of an executed distributed query.
 */
export interface QueryExecution {
  id: string;
  sessionId: string;
  profileId?: string;
  selector: string;
  target: QueryTarget | string;
  consolidation?: QueryConsolidation | string;
  timeoutMs: number;
  requestPayload?: number[] | null;
  requestEncoding?: EncodingType | string;
  status: QueryStatus;
  replies: ReplySample[];
  startedAt: number;
  durationMs?: number;
  error?: string | null;
}

