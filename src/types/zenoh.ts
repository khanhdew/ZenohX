// Copyright 2026 ZenohX Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

export type QosPriority =
  | 'realtime'
  | 'interactive_high'
  | 'interactive_low'
  | 'data_high'
  | 'data'
  | 'data_low'
  | 'background';

export type CongestionControl = 'drop' | 'block';

export type SubscriptionOrigin = 'any' | 'session_local' | 'remote';

export interface PublishOptions {
  priority?: QosPriority | string;
  congestion_control?: CongestionControl | string;
  express?: boolean;
  attachment?: number[];
}

export interface SubscribeOptions {
  allowed_origin?: SubscriptionOrigin | string;
}

export interface StreamGeneratorConfig {
  session_id: string;
  generator_id: string;
  key_expr: string;
  encoding: string;
  rate_hz: number;
  payload_template: string;
  priority?: QosPriority | string;
  congestion_control?: CongestionControl | string;
  total_count?: number;
}

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
  tls_only?: boolean;
}

/**
 * Configuration for exponential reconnection retry strategy.
 */
export interface ReconnectRetryConfig {
  period_init_ms: number;
  period_max_ms: number;
  factor: number;
  timeout_ms: number;
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
  scout_gossip?: boolean;
  reconnect_retry?: ReconnectRetryConfig | null;
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
  scout_gossip?: boolean;
  reconnect_retry?: ReconnectRetryConfig | null;
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
  source_id?: string | null;
}

/**
 * Authoritative link connection info retrieved from session.info().links() & transports().
 */
export interface SessionLinkInfo {
  zid: string;
  whatami: 'router' | 'peer' | 'client' | string;
  src: string;
  dst: string;
  is_streamed: boolean;
  mtu?: number;
  interfaces?: string[];
  auth_identifier?: string;
  reliability?: string;
  priorities?: string;
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
  scout_gossip?: boolean;
  connect_locators: string[];
  listen_locators: string[];
  bound_locators?: string[];
  created_at: number;
  connected_routers?: string[];
  connected_peers?: string[];
  links?: SessionLinkInfo[];
  active_subscribers?: number;
  active_queryables?: number;
  uptime_seconds?: number;
}

/**
 * Active Zenoh session representation.
 */
export interface ActiveSession {
  id: string;
  profile_id?: string | null;
  zid?: string;
  mode?: ConnectionMode | string;
  scout_multicast?: boolean;
  scout_gossip?: boolean;
  connect_locators?: string[];
  listen_locators?: string[];
  bound_locators?: string[];
  connected_at?: string | number;
  created_at?: string | number;
  connected_routers?: string[];
  connected_peers?: string[];
  links?: SessionLinkInfo[];
  active_subscribers?: number;
  active_queryables?: number;
  uptime_seconds?: number;
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
  source_id?: string | null;
  priority?: string | null;
  express?: boolean | null;
  attachment?: number[] | null;
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
  allowedOrigin?: SubscriptionOrigin | string;
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
  sourceId?: string | null;
  senderZid?: string | null;
  priority?: string | null;
  express?: boolean | null;
  attachment?: number[] | null;
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

