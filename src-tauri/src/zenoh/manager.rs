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

use super::pubsub::{
    publish_sample_with_options, subscribe_with_callback_and_options, ActiveSubscriber,
};
use super::query::{
    declare_queryable_with_handler, execute_query, ActiveQueryable, QueryHandle,
};
use super::scout::scout_nodes;
use super::types::{
    AdminSpaceEntry, InboundQuery, NodeConfigurationResult, PublishOptions, ReplySample, ScoutedNode, SessionConfig,
    SessionInfo, SessionLinkInfo, SessionStatusEvent, StreamGeneratorConfig, SubscribeOptions,
    ZenohSample,
};
use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use uuid::Uuid;

pub type StatusCallback = Arc<dyn Fn(SessionStatusEvent) + Send + Sync>;

/// Context representing an active Zenoh session and its associated metadata.
pub struct SessionContext {
    pub id: Uuid,
    pub profile_id: Option<String>,
    pub session: zenoh::Session,
    pub config: SessionConfig,
    pub created_at: i64,
    pub subscribers: HashMap<Uuid, ActiveSubscriber>,
    pub queryables: HashMap<Uuid, ActiveQueryable>,
    pub watchdog_stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

/// Centralized manager for handling multiple concurrent Zenoh sessions, pub/sub, and queries.
#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<Uuid, SessionContext>>>,
    pending_queries: Arc<RwLock<HashMap<Uuid, QueryHandle>>>,
    status_callback: Arc<RwLock<Option<StatusCallback>>>,
    generators: Arc<RwLock<HashMap<Uuid, tokio::sync::oneshot::Sender<()>>>>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    /// Creates a new, empty `SessionManager`.
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            pending_queries: Arc::new(RwLock::new(HashMap::new())),
            status_callback: Arc::new(RwLock::new(None)),
            generators: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Sets a callback to be notified when session connection statuses change.
    pub async fn set_status_callback<F>(&self, callback: F)
    where
        F: Fn(SessionStatusEvent) + Send + Sync + 'static,
    {
        let mut lock = self.status_callback.write().await;
        *lock = Some(Arc::new(callback));
    }

    /// Connects to a Zenoh network using the provided configuration.
    ///
    /// Returns the unique `Uuid` identifier assigned to this session.
    pub async fn connect(&self, config: SessionConfig) -> Result<Uuid, String> {
        // Strict Hard-Bind: 1 Connection Profile on UI == Exactly 1 Peer Node in Rust
        if let Some(pid) = &config.profile_id {
            let existing_active_session: Option<Uuid> = {
                let lock = self.sessions.read().await;
                lock.iter().find_map(|(id, ctx)| {
                    if ctx.profile_id.as_ref() == Some(pid) && !ctx.session.is_closed() {
                        Some(*id)
                    } else {
                        None
                    }
                })
            };

            if let Some(active_id) = existing_active_session {
                // Return existing session directly without creating another Zenoh peer node
                return Ok(active_id);
            }

            let stale_ids: Vec<Uuid> = {
                let lock = self.sessions.read().await;
                lock.iter()
                    .filter_map(|(id, ctx)| {
                        if ctx.profile_id.as_ref() == Some(pid) {
                            Some(*id)
                        } else {
                            None
                        }
                    })
                    .collect()
            };
            for id in stale_ids {
                let _ = self.disconnect(&id).await;
            }
        }

        let zenoh_config = config.to_zenoh_config()?;
        let session = zenoh::open(zenoh_config)
            .await
            .map_err(|e| format!("failed to open zenoh session: {e}"))?;

        let session_id = Uuid::new_v4();
        let profile_id = config.profile_id.clone();
        let now = chrono::Utc::now().timestamp();

        let (watchdog_stop_tx, mut watchdog_stop_rx) = tokio::sync::oneshot::channel::<()>();

        let context = SessionContext {
            id: session_id,
            profile_id,
            session: session.clone(),
            config: config.clone(),
            created_at: now,
            subscribers: HashMap::new(),
            queryables: HashMap::new(),
            watchdog_stop_tx: Some(watchdog_stop_tx),
        };

        {
            let mut lock = self.sessions.write().await;
            lock.insert(session_id, context);
        }

        // Spawn watchdog monitor to detect unexpected network drops or router crashes
        let sessions_arc = self.sessions.clone();
        let pending_queries_arc = self.pending_queries.clone();
        let status_cb_arc = self.status_callback.clone();
        let is_client = config.mode.to_lowercase() == "client";
        let has_reconnect_retry = config.reconnect_retry.is_some();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(1500));
            interval.tick().await; // Consume immediate first tick

            let mut had_connection = false;
            let mut initial_grace_ticks = 3;

            loop {
                tokio::select! {
                    _ = &mut watchdog_stop_rx => {
                        // Clean manual disconnect; stop watchdog quietly
                        break;
                    }
                    _ = interval.tick() => {
                        if session.is_closed() {
                            handle_unexpected_disconnect(
                                session_id,
                                &sessions_arc,
                                &pending_queries_arc,
                                &status_cb_arc,
                                "Zenoh session closed unexpectedly",
                            ).await;
                            break;
                        }

                        // For client mode without reconnect retry configured, notify if router connection drops.
                        // Routers and peers are standalone nodes with their own lifecycle and listeners,
                        // so losing a remote neighbor/upstream must never disconnect their local session.
                        if is_client && !has_reconnect_retry {
                            let mut router_count = 0;
                            let mut routers = session.info().routers_zid().await;
                            while let Some(_) = routers.next() {
                                router_count += 1;
                            }

                            if router_count > 0 {
                                had_connection = true;
                            } else if had_connection {
                                handle_unexpected_disconnect(
                                    session_id,
                                    &sessions_arc,
                                    &pending_queries_arc,
                                    &status_cb_arc,
                                    "Connection to Zenoh router lost: router unreachable",
                                ).await;
                                break;
                            } else if initial_grace_ticks > 0 {
                                initial_grace_ticks -= 1;
                            }
                        }
                    }
                }
            }
        });

        if let Some(cb) = &*self.status_callback.read().await {
            cb(SessionStatusEvent {
                session_id: session_id.to_string(),
                status: "connected".to_string(),
                error: None,
                timestamp: Some(now),
            });
        }

        Ok(session_id)
    }

    /// Disconnects and explicitly closes an active Zenoh session by its ID.
    pub async fn disconnect(&self, session_id: &Uuid) -> Result<(), String> {
        let mut lock = self.sessions.write().await;
        if let Some(mut context) = lock.remove(session_id) {
            // Signal watchdog task to stop cleanly without emitting unexpected disconnect
            if let Some(tx) = context.watchdog_stop_tx.take() {
                let _ = tx.send(());
            }

            // Stop all active background subscriber tasks for this session
            for (_, sub) in context.subscribers {
                sub.stop().await;
            }
            // Stop all active background queryable tasks for this session
            for (_, qable) in context.queryables {
                qable.stop().await;
            }
            // Clean up any pending queries associated with this session
            {
                let mut pending = self.pending_queries.write().await;
                pending.retain(|_, handle| &handle.session_id != session_id);
            }
            // Gracefully close the Zenoh session, ignoring timeout during teardown
            let _ = tokio::time::timeout(Duration::from_millis(1500), context.session.close()).await;

            let status_cb = self.status_callback.read().await.clone();
            if let Some(cb) = status_cb {
                cb(SessionStatusEvent {
                    session_id: session_id.to_string(),
                    status: "disconnected".to_string(),
                    error: None,
                    timestamp: Some(chrono::Utc::now().timestamp()),
                });
            }

            Ok(())
        } else {
            Err(format!("session with id '{session_id}' not found"))
        }
    }


    /// Subscribes to a key expression with a callback function for sample streaming.
    pub async fn subscribe<F>(
        &self,
        session_id: &Uuid,
        sub_id: Uuid,
        key_expr: &str,
        callback: F,
    ) -> Result<(), String>
    where
        F: Fn(ZenohSample) + Send + Sync + 'static,
    {
        self.subscribe_with_options(session_id, sub_id, key_expr, None, callback).await
    }

    /// Subscribes to a key expression with QoS options and a callback function.
    pub async fn subscribe_with_options<F>(
        &self,
        session_id: &Uuid,
        sub_id: Uuid,
        key_expr: &str,
        options: Option<SubscribeOptions>,
        callback: F,
    ) -> Result<(), String>
    where
        F: Fn(ZenohSample) + Send + Sync + 'static,
    {
        let mut lock = self.sessions.write().await;
        let context = lock
            .get_mut(session_id)
            .ok_or_else(|| format!("session with id '{session_id}' not found"))?;

        // If an existing subscriber with the same sub_id exists, stop it first
        if let Some(old_sub) = context.subscribers.remove(&sub_id) {
            old_sub.stop().await;
        }

        let active_sub =
            subscribe_with_callback_and_options(&context.session, *session_id, sub_id, key_expr, options, callback)
                .await?;
        context.subscribers.insert(sub_id, active_sub);

        Ok(())
    }

    /// Unsubscribes an active subscriber by sub_id.
    pub async fn unsubscribe(&self, session_id: &Uuid, sub_id: Uuid) -> Result<(), String> {
        let mut lock = self.sessions.write().await;
        let context = lock
            .get_mut(session_id)
            .ok_or_else(|| format!("session with id '{session_id}' not found"))?;

        if let Some(sub) = context.subscribers.remove(&sub_id) {
            sub.stop().await;
            Ok(())
        } else {
            Err(format!(
                "subscriber with id '{sub_id}' not found in session '{session_id}'"
            ))
        }
    }

    /// Publishes a payload with the specified encoding and operation kind (put or delete).
    pub async fn publish(
        &self,
        session_id: &Uuid,
        key_expr: &str,
        payload: Vec<u8>,
        encoding: &str,
        kind: &str,
    ) -> Result<(), String> {
        self.publish_with_options(session_id, key_expr, payload, encoding, kind, None).await
    }

    /// Publishes a payload with advanced QoS options (priority, congestion control, express, attachment).
    pub async fn publish_with_options(
        &self,
        session_id: &Uuid,
        key_expr: &str,
        payload: Vec<u8>,
        encoding: &str,
        kind: &str,
        options: Option<PublishOptions>,
    ) -> Result<(), String> {
        let session = self.get_session(session_id).await?;
        publish_sample_with_options(&session, key_expr, payload, encoding, kind, options).await
    }

    /// Starts a high-rate background stream generator that publishes samples at a fixed rate.
    pub async fn start_stream_generator(&self, config: StreamGeneratorConfig) -> Result<(), String> {
        let session = self.get_session(&config.session_id).await?;
        let gen_id = config.generator_id;

        // If generator already exists, stop it first
        self.stop_stream_generator(&gen_id).await.ok();

        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
        {
            let mut gen_lock = self.generators.write().await;
            gen_lock.insert(gen_id, stop_tx);
        }

        let rate_hz = config.rate_hz.max(1).min(10000);
        let interval_nanos = 1_000_000_000u64 / rate_hz as u64;
        let mut ticker = tokio::time::interval(std::time::Duration::from_nanos(interval_nanos));
        ticker.tick().await; // Consume first tick

        let key_expr = config.key_expr;
        let encoding = config.encoding;
        let template = config.payload_template;
        let total_count = config.total_count;
        let options = PublishOptions {
            priority: config.priority,
            congestion_control: config.congestion_control,
            express: Some(rate_hz >= 100),
            attachment: None,
        };

        let generators_arc = self.generators.clone();

        tokio::spawn(async move {
            let mut counter: u64 = 0;
            loop {
                tokio::select! {
                    _ = &mut stop_rx => {
                        break;
                    }
                    _ = ticker.tick() => {
                        counter += 1;
                        let now = chrono::Utc::now().timestamp_millis();
                        let interpolated = template
                            .replace("{{counter}}", &counter.to_string())
                            .replace("{{timestamp}}", &now.to_string())
                            .replace("{{sin}}", &format!("{:.4}", (counter as f64 * 0.1).sin()))
                            .replace("{{random}}", &(counter.wrapping_mul(1103515245).wrapping_add(12345) % 1000).to_string());

                        let payload_bytes = interpolated.into_bytes();
                        let _ = publish_sample_with_options(
                            &session,
                            &key_expr,
                            payload_bytes,
                            &encoding,
                            "put",
                            Some(options.clone()),
                        ).await;

                        if let Some(limit) = total_count {
                            if counter >= limit {
                                break;
                            }
                        }
                    }
                }
            }

            let mut lock = generators_arc.write().await;
            lock.remove(&gen_id);
        });

        Ok(())
    }

    /// Stops an active background stream generator by ID.
    pub async fn stop_stream_generator(&self, generator_id: &Uuid) -> Result<(), String> {
        let mut lock = self.generators.write().await;
        if let Some(tx) = lock.remove(generator_id) {
            let _ = tx.send(());
            Ok(())
        } else {
            Err(format!("stream generator with id '{generator_id}' not found"))
        }
    }

    /// Executes a distributed query `session.get` and collects all replies until timeout.
    pub async fn query_get(
        &self,
        session_id: &Uuid,
        selector: &str,
        target: &str,
        timeout_ms: u64,
    ) -> Result<Vec<ReplySample>, String> {
        self.query_get_advanced(session_id, selector, target, timeout_ms, None, None, None).await
    }

    /// Executes a distributed query `session.get` with optional payload, encoding, and consolidation.
    pub async fn query_get_advanced(
        &self,
        session_id: &Uuid,
        selector: &str,
        target: &str,
        timeout_ms: u64,
        payload: Option<Vec<u8>>,
        encoding: Option<String>,
        consolidation: Option<String>,
    ) -> Result<Vec<ReplySample>, String> {
        let session = self.get_session(session_id).await?;
        execute_query(
            &session,
            *session_id,
            selector,
            target,
            timeout_ms,
            payload,
            encoding,
            consolidation,
        )
        .await
    }


    /// Declares a queryable with a custom programmatic async handler.
    pub async fn declare_queryable<F, Fut>(
        &self,
        session_id: &Uuid,
        queryable_id: Uuid,
        key_expr: &str,
        handler: F,
    ) -> Result<(), String>
    where
        F: Fn(QueryHandle) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let mut lock = self.sessions.write().await;
        let context = lock
            .get_mut(session_id)
            .ok_or_else(|| format!("session with id '{session_id}' not found"))?;


        // If an existing queryable with the same queryable_id exists, stop it first
        if let Some(old_q) = context.queryables.remove(&queryable_id) {
            old_q.stop().await;
        }

        let active_q = declare_queryable_with_handler(


            &context.session,
            *session_id,
            queryable_id,
            key_expr,
            handler,
        )
        .await?;

        context.queryables.insert(queryable_id, active_q);

        Ok(())
    }

    /// Declares a queryable routed to frontend/callbacks with token-based query handling.
    pub async fn declare_queryable_routed<F>(
        &self,
        session_id: &Uuid,
        queryable_id: Uuid,
        key_expr: &str,
        on_query: F,
    ) -> Result<(), String>
    where
        F: Fn(InboundQuery) + Send + Sync + 'static,
    {
        let pending = self.pending_queries.clone();
        let on_query_arc = Arc::new(on_query);

        self.declare_queryable(session_id, queryable_id, key_expr, move |handle| {
            let pending = pending.clone();
            let on_query = on_query_arc.clone();
            async move {
                let token = handle.token;
                let effective_key = if !handle.key_expr.contains('*') && !handle.key_expr.contains('$') && !handle.key_expr.is_empty() {
                    handle.key_expr.clone()
                } else if !handle.queryable_key_expr.contains('*') && !handle.queryable_key_expr.contains('$') && !handle.queryable_key_expr.is_empty() {
                    handle.queryable_key_expr.clone()
                } else {
                    handle.key_expr.clone()
                };

                let inbound = InboundQuery {
                    token,
                    session_id: handle.session_id,
                    queryable_id: handle.queryable_id,
                    key_expr: effective_key,
                    parameters: handle.parameters.clone(),
                    payload: handle.payload.clone(),
                    encoding: handle.encoding.clone(),
                    timestamp: handle.timestamp,
                };
                {
                    let mut lock = pending.write().await;
                    lock.insert(token, handle);
                }
                (on_query)(inbound);
            }
        })
        .await
    }

    /// Undeclares an active queryable by queryable_id.
    pub async fn undeclare_queryable(
        &self,
        session_id: &Uuid,
        queryable_id: Uuid,
    ) -> Result<(), String> {
        let mut lock = self.sessions.write().await;
        let context = lock
            .get_mut(session_id)
            .ok_or_else(|| format!("session with id '{session_id}' not found"))?;

        if let Some(q) = context.queryables.remove(&queryable_id) {
            q.stop().await;
            // Clean up any pending queries associated with this queryable
            {
                let mut pending = self.pending_queries.write().await;
                pending.retain(|_, handle| handle.queryable_id != queryable_id);
            }
            Ok(())
        } else {
            Err(format!(
                "queryable with id '{queryable_id}' not found in session '{session_id}'"
            ))
        }
    }

    /// Responds to a pending inbound query identified by its token.
    pub async fn reply_query(
        &self,
        token: &Uuid,
        key_expr: &str,
        payload: Vec<u8>,
        encoding: &str,
    ) -> Result<(), String> {
        let handle = {
            let mut lock = self.pending_queries.write().await;
            lock.remove(token)
                .ok_or_else(|| format!("inbound query with token '{token}' not found or already replied"))?
        };

        handle.reply_with_encoding(key_expr, payload, encoding).await
    }

    /// Checks if a session is currently open and managed.
    pub async fn has_session(&self, session_id: &Uuid) -> bool {
        let lock = self.sessions.read().await;
        lock.contains_key(session_id)
    }

    /// Retrieves the profile ID associated with a session if any.
    pub async fn get_session_profile_id(&self, session_id: &Uuid) -> Option<String> {
        let lock = self.sessions.read().await;
        lock.get(session_id).and_then(|ctx| ctx.profile_id.clone())
    }

    /// Retrieves a cloned `zenoh::Session` handle for a given session ID.
    pub async fn get_session(&self, session_id: &Uuid) -> Result<zenoh::Session, String> {
        let lock = self.sessions.read().await;
        lock.get(session_id)
            .map(|ctx| ctx.session.clone())
            .ok_or_else(|| format!("session with id '{session_id}' not found"))
    }

    /// Helper to extract deep introspection & telemetry metadata from an active Zenoh session.
    async fn extract_session_info(
        id: Uuid,
        session: &zenoh::Session,
        profile_id: Option<String>,
        config: SessionConfig,
        created_at: i64,
        active_subscribers: usize,
        active_queryables: usize,
    ) -> SessionInfo {
        let zid = session.zid().to_string();

        let mut connected_routers = Vec::new();
        let mut routers = session.info().routers_zid().await;
        while let Some(router_zid) = routers.next() {
            connected_routers.push(router_zid.to_string());
        }

        let mut connected_peers = Vec::new();
        let mut peers = session.info().peers_zid().await;
        while let Some(peer_zid) = peers.next() {
            connected_peers.push(peer_zid.to_string());
        }

        // Retrieve real bound listening locators and resolve 0.0.0.0 to real IPs
        let mut raw_listen_locators: Vec<String> = Vec::new();
        for loc in session.info().locators().await {
            raw_listen_locators.push(loc.to_string());
        }
        let real_listen_locators = resolve_bound_locators(raw_listen_locators);

        // Retrieve authoritative live transports & links with full telemetry
        let mut transport_map = std::collections::HashMap::new();
        for t in session.info().transports().await {
            let whatami_str = format!("{:?}", t.whatami()).to_lowercase();
            let t_zid = t.zid().to_string();
            if (whatami_str.contains("router") || whatami_str == "router") && !connected_routers.contains(&t_zid) {
                connected_routers.push(t_zid.clone());
            } else if (whatami_str.contains("peer") || whatami_str == "peer") && !connected_peers.contains(&t_zid) {
                connected_peers.push(t_zid.clone());
            }
            transport_map.insert(t_zid, whatami_str);
        }

        let mut links = Vec::new();
        for l in session.info().links().await {
            let link_zid = l.zid().to_string();
            let whatami = transport_map
                .get(&link_zid)
                .cloned()
                .unwrap_or_else(|| "router".to_string());

            if (whatami.contains("router") || whatami == "router") && !connected_routers.contains(&link_zid) {
                connected_routers.push(link_zid.clone());
            } else if (whatami.contains("peer") || whatami == "peer") && !connected_peers.contains(&link_zid) {
                connected_peers.push(link_zid.clone());
            }

            links.push(SessionLinkInfo {
                zid: link_zid,
                whatami,
                src: l.src().to_string(),
                dst: l.dst().to_string(),
                is_streamed: l.is_streamed(),
                mtu: Some(l.mtu()),
                interfaces: l.interfaces().to_vec(),
                auth_identifier: l.auth_identifier().map(|s| s.to_string()),
                reliability: l.reliability().map(|r| format!("{:?}", r).to_lowercase()),
                priorities: l.priorities().map(|(min, max)| format!("{min}-{max}")),
            });
        }

        let now = chrono::Utc::now().timestamp();
        let uptime_seconds = (now - created_at).max(0) as u64;

        SessionInfo {
            id,
            profile_id,
            zid,
            mode: config.mode,
            scout_multicast: config.scout_multicast,
            scout_gossip: config.scout_gossip,
            connect_locators: config.connect_locators,
            listen_locators: config.listen_locators.clone(),
            bound_locators: real_listen_locators,
            created_at,
            connected_routers,
            connected_peers,
            links,
            active_subscribers,
            active_queryables,
            uptime_seconds,
        }
    }

    /// Retrieves session information for a given session ID.
    pub async fn get_session_info(&self, session_id: &Uuid) -> Result<SessionInfo, String> {
        let (session, profile_id, config, created_at, active_subscribers, active_queryables) = {
            let lock = self.sessions.read().await;
            let ctx = lock
                .get(session_id)
                .ok_or_else(|| format!("session with id '{session_id}' not found"))?;
            (
                ctx.session.clone(),
                ctx.profile_id.clone(),
                ctx.config.clone(),
                ctx.created_at,
                ctx.subscribers.len(),
                ctx.queryables.len(),
            )
        };

        Ok(Self::extract_session_info(
            *session_id,
            &session,
            profile_id,
            config,
            created_at,
            active_subscribers,
            active_queryables,
        ).await)
    }

    /// Retrieves information for all currently managed sessions.
    pub async fn get_all_sessions(&self) -> Vec<SessionInfo> {
        let contexts: Vec<(Uuid, zenoh::Session, Option<String>, SessionConfig, i64, usize, usize)> = {
            let lock = self.sessions.read().await;
            lock.values()
                .map(|ctx| (
                    ctx.id,
                    ctx.session.clone(),
                    ctx.profile_id.clone(),
                    ctx.config.clone(),
                    ctx.created_at,
                    ctx.subscribers.len(),
                    ctx.queryables.len(),
                ))
                .collect()
        };

        let mut result = Vec::with_capacity(contexts.len());
        for (id, session, profile_id, config, created_at, active_subscribers, active_queryables) in contexts {
            result.push(Self::extract_session_info(
                id,
                &session,
                profile_id,
                config,
                created_at,
                active_subscribers,
                active_queryables,
            ).await);
        }

        result
    }

    /// Retrieves full authoritative node configuration (JSON5) by ZID.
    pub async fn get_node_configuration(&self, zid: &str) -> Result<NodeConfigurationResult, String> {
        let raw_id = zid
            .strip_prefix("profile-")
            .or_else(|| zid.strip_prefix("scouted-"))
            .or_else(|| zid.strip_prefix("admin-"))
            .unwrap_or(zid);
        let clean_zid = raw_id.replace('-', "").to_lowercase();
        let original_trimmed = zid.trim();

        // 1. Check if zid belongs to an active local session
        let local_match = {
            let lock = self.sessions.read().await;
            lock.values().find_map(|ctx| {
                let session_zid_raw = ctx.session.zid().to_string();
                let session_zid = session_zid_raw.replace('-', "").to_lowercase();
                let ctx_pid = ctx.profile_id.as_deref().unwrap_or("");
                let clean_pid = ctx_pid.replace('-', "").to_lowercase();

                let matches_session_zid = session_zid == clean_zid
                    || (!clean_zid.is_empty() && (session_zid.contains(&clean_zid) || clean_zid.contains(&session_zid)));
                let matches_profile_id = ctx_pid == original_trimmed
                    || ctx_pid == raw_id
                    || (!clean_pid.is_empty() && clean_pid == clean_zid);

                if matches_session_zid || matches_profile_id {
                    Some((ctx.id, ctx.profile_id.clone(), ctx.config.clone(), ctx.session.clone(), session_zid_raw))
                } else {
                    None
                }
            })
        };

        if let Some((_id, profile_id, config, session, real_zid)) = local_match {
            let mut raw_listen: Vec<String> = Vec::new();
            for loc in session.info().locators().await {
                raw_listen.push(loc.to_string());
            }
            let real_listen = resolve_bound_locators(raw_listen);
            let is_router = config.mode.to_lowercase() == "router";
            let json5 = config.generate_json5(Some(&real_zid), if is_router { &real_listen } else { &[] });

            let locators = if is_router {
                if !config.listen_locators.is_empty() {
                    config.listen_locators.clone()
                } else if !real_listen.is_empty() {
                    real_listen
                } else {
                    vec!["tcp/0.0.0.0:7447".to_string()]
                }
            } else {
                real_listen
            };

            return Ok(NodeConfigurationResult {
                zid: real_zid,
                profile_id,
                mode: config.mode,
                status: "connected".to_string(),
                locators,
                connect_locators: config.connect_locators,
                json5,
                is_local: true,
            });
        }

        // 2. Query active sessions' admin space or scout to find remote router/peer node
        let remote_admin_entries = {
            let session_id = {
                let lock = self.sessions.read().await;
                lock.keys().next().copied()
            };

            if let Some(id) = session_id {
                let selector = format!("@/{clean_zid}/**");
                self.query_admin_space(&id, Some(&selector), 1500).await.unwrap_or_default()
            } else {
                Vec::new()
            }
        };

        // Extract remote locators and connect locators from admin space
        let mut remote_locs = Vec::new();
        let mut remote_connect_locs = Vec::new();
        let mut remote_mode = "router".to_string();
        for entry in &remote_admin_entries {
            if entry.key_expr.contains("/session/info") {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&entry.payload_json) {
                    if let Some(what) = v.get("whatami").and_then(|v| v.as_str()) {
                        remote_mode = what.to_lowercase();
                    }
                }
            } else if entry.key_expr.contains("/listen") {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&entry.payload_json) {
                    if let Some(src) = v.get("src").and_then(|v| v.as_str()) {
                        if !src.ends_with(":0") && !src.contains("127.0.0.1") {
                            remote_locs.push(src.to_string());
                        }
                    }
                }
            } else if entry.key_expr.contains("/session/link") {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&entry.payload_json) {
                    if let Some(dst) = v.get("dst").and_then(|v| v.as_str()) {
                        if !dst.is_empty()
                            && !dst.contains("127.0.0.1")
                            && !dst.ends_with(":0")
                            && !is_ephemeral_port_locator(dst)
                        {
                            remote_connect_locs.push(dst.to_string());
                        }
                    }
                }
            } else if entry.key_expr.contains("/config") {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&entry.payload_json) {
                    if let Some(endpoints) = v.get("connect").and_then(|c| c.get("endpoints")).and_then(|e| e.as_array()) {
                        for ep in endpoints {
                            if let Some(s) = ep.as_str() {
                                if !s.is_empty() && !s.contains("127.0.0.1") {
                                    remote_connect_locs.push(s.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        remote_locs.sort();
        remote_locs.dedup();
        remote_connect_locs.sort();
        remote_connect_locs.dedup();

        let is_remote_router = remote_mode.to_lowercase() == "router";
        let remote_config = SessionConfig {
            profile_id: None,
            mode: remote_mode.clone(),
            connect_locators: remote_connect_locs.clone(),
            listen_locators: if is_remote_router { remote_locs.clone() } else { vec![] },
            scout_multicast: true,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };

        let json5 = remote_config.generate_json5(Some(&clean_zid), if is_remote_router { &remote_locs } else { &[] });

        Ok(NodeConfigurationResult {
            zid: clean_zid,
            profile_id: None,
            mode: remote_mode,
            status: "remote".to_string(),
            locators: remote_locs,
            connect_locators: remote_connect_locs,
            json5,
            is_local: false,
        })
    }

    /// Scans the local network for Zenoh routers and peers via multicast.
    pub async fn scout_locators(&self, timeout_ms: u64) -> Result<Vec<ScoutedNode>, String> {
        scout_nodes(timeout_ms).await
    }

    /// Queries the internal Zenoh Admin Space (@/**) across the mesh to introspect remote routers, links, and nodes.
    pub async fn query_admin_space(
        &self,
        session_id: &Uuid,
        selector: Option<&str>,
        timeout_ms: u64,
    ) -> Result<Vec<AdminSpaceEntry>, String> {
        let sel = selector.unwrap_or("@/**");
        let replies = self
            .query_get_advanced(
                session_id,
                sel,
                "all",
                timeout_ms,
                None,
                None,
                Some("none".to_string()),
            )
            .await?;

        let mut entries = Vec::new();
        for r in replies {
            if r.is_err {
                continue;
            }
            let key = r.key_expr.clone();
            let stripped = key.trim_start_matches("@/");
            let parts: Vec<&str> = stripped.split('/').collect();

            let payload_json = String::from_utf8(r.payload).unwrap_or_default();

            // Extract ZID accurately from the first path segment (root ZID) or payload JSON
            let mut zid = None;
            if let Some(first) = parts.first() {
                let first_lower = first.to_lowercase();
                if first_lower != "session"
                    && first_lower != "link"
                    && first_lower != "links"
                    && first_lower != "transport"
                    && first_lower != "transports"
                    && first_lower != "unicast"
                    && first_lower != "multicast"
                    && first_lower != "listen"
                    && first_lower != "connect"
                    && first_lower != "router"
                    && first_lower != "subscriber"
                    && first_lower != "publisher"
                    && first_lower != "queryable"
                    && first_lower != "admin"
                    && first_lower != "info"
                    && first_lower != "config"
                    && first_lower != "stats"
                    && !first_lower.contains('.')
                    && !first_lower.contains(':')
                    && first_lower.len() >= 8
                {
                    zid = Some(first.to_string());
                }
            }

            if zid.is_none() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&payload_json) {
                    if let Some(z) = v.get("zid").and_then(|z| z.as_str()) {
                        zid = Some(z.to_string());
                    }
                }
            }

            let category = if key.contains("/session/link") {
                "link"
            } else if key.contains("/session/transport") {
                "transport"
            } else if key.contains("/session/info") {
                "info"
            } else if key.contains("/router") {
                "router"
            } else if key.contains("/subscriber") {
                "sub"
            } else if key.contains("/publisher") {
                "pub"
            } else {
                "other"
            };

            entries.push(AdminSpaceEntry {
                key_expr: key,
                zid,
                category: category.to_string(),
                payload_json,
                timestamp: r.timestamp,
            });
        }

        Ok(entries)
    }

    /// Recursively discovers admin space topology across connected routers and peers up to max_depth waves.
    pub async fn discover_admin_topology(
        &self,
        session_id: &Uuid,
        max_depth: usize,
        timeout_ms: u64,
    ) -> Result<Vec<AdminSpaceEntry>, String> {
        let mut all_entries = Vec::new();
        let mut visited_zids = std::collections::HashSet::new();
        let mut key_set = std::collections::HashSet::new();

        // 1. Root query @/**
        let root_entries = self.query_admin_space(session_id, Some("@/**"), timeout_ms).await?;
        let mut next_wave_zids = Vec::new();

        for entry in root_entries {
            if let Some(ref zid) = entry.zid {
                visited_zids.insert(zid.to_lowercase());
            }
            // Extract neighbor/sub-node ZIDs from entry
            if entry.key_expr.contains("/router/") {
                let parts: Vec<&str> = entry.key_expr.split('/').collect();
                if let Some(idx) = parts.iter().position(|&p| p == "router") {
                    if idx + 1 < parts.len() {
                        next_wave_zids.push(parts[idx + 1].to_lowercase());
                    }
                }
            }
            if key_set.insert(entry.key_expr.clone()) {
                all_entries.push(entry);
            }
        }

        // Dedup and filter root next_wave_zids
        next_wave_zids.sort();
        next_wave_zids.dedup();
        next_wave_zids.retain(|z| !visited_zids.contains(z));

        // 2. Iterative BFS waves up to max_depth
        let mut current_depth = 1;
        while current_depth < max_depth && !next_wave_zids.is_empty() {
            let wave = std::mem::take(&mut next_wave_zids);
            let unvisited: Vec<String> = wave
                .into_iter()
                .filter(|z| visited_zids.insert(z.clone()))
                .collect();

            if unvisited.is_empty() {
                break;
            }

            let wave_timeout = (timeout_ms / 2).max(1000);
            let query_futures = unvisited.iter().map(|target_zid| async move {
                let sel = format!("@/{target_zid}/**");
                self.query_admin_space(session_id, Some(&sel), wave_timeout).await
            });

            let wave_results = futures::future::join_all(query_futures).await;

            for entries_res in wave_results {
                if let Ok(entries) = entries_res {
                    for entry in entries {
                        if entry.key_expr.contains("/router/") {
                            let parts: Vec<&str> = entry.key_expr.split('/').collect();
                            if let Some(idx) = parts.iter().position(|&p| p == "router") {
                                if idx + 1 < parts.len() {
                                    let sub = parts[idx + 1].to_lowercase();
                                    if !visited_zids.contains(&sub) {
                                        next_wave_zids.push(sub);
                                    }
                                }
                            }
                        }
                        if key_set.insert(entry.key_expr.clone()) {
                            all_entries.push(entry);
                        }
                    }
                }
            }

            // Dedup sub-node ZIDs extracted from this wave
            next_wave_zids.sort();
            next_wave_zids.dedup();
            next_wave_zids.retain(|z| !visited_zids.contains(z));

            current_depth += 1;
        }

        Ok(all_entries)
    }
}

/// Helper function to clean up session context and broadcast status event when a sudden disconnect occurs.
async fn handle_unexpected_disconnect(
    session_id: Uuid,
    sessions: &Arc<RwLock<HashMap<Uuid, SessionContext>>>,
    pending_queries: &Arc<RwLock<HashMap<Uuid, QueryHandle>>>,
    status_callback: &Arc<RwLock<Option<StatusCallback>>>,
    reason: &str,
) {
    let mut lock = sessions.write().await;
    if let Some(context) = lock.remove(&session_id) {
        // Stop all active subscribers
        for (_, sub) in context.subscribers {
            sub.stop().await;
        }
        // Stop all active queryables
        for (_, qable) in context.queryables {
            qable.stop().await;
        }
        // Clean up pending queries
        {
            let mut pending = pending_queries.write().await;
            pending.retain(|_, handle| handle.session_id != session_id);
        }

        // Close session in background
        tokio::spawn(async move {
            let _ = tokio::time::timeout(Duration::from_millis(1000), context.session.close()).await;
        });

        // Notify via status callback
        let cb_lock = status_callback.read().await;
        if let Some(ref cb) = *cb_lock {
            let now = chrono::Utc::now().timestamp_millis();
            let event = SessionStatusEvent {
                session_id: session_id.to_string(),
                status: "disconnected".to_string(),
                error: Some(reason.to_string()),
                timestamp: Some(now),
            };
            cb(event);
        }
    }
}

/// Attempts to detect the primary local non-loopback IP address of this machine.
fn get_primary_local_ip() -> Option<std::net::IpAddr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    if !ip.is_unspecified() && !ip.is_loopback() {
        Some(ip)
    } else {
        None
    }
}

/// Checks if a locator contains an IPv6 or IPv4 link-local address (e.g. fe80::/10 or 169.254.0.0/16).
pub fn is_link_local_locator(loc: &str) -> bool {
    let lower = loc.to_lowercase();

    // IPv6 link-local addresses are fe80::/10 (fe80 to febf)
    if lower.contains("[fe8")
        || lower.contains("[fe9")
        || lower.contains("[fea")
        || lower.contains("[feb")
        || lower.contains("fe80:")
        || lower.contains("/fe80:")
    {
        return true;
    }

    // IPv4 link-local addresses are 169.254.0.0/16
    if lower.contains("169.254.") {
        return true;
    }

    // Extract host portion if possible
    if let Some(host_port) = loc.split('/').last() {
        let host = if host_port.starts_with('[') {
            host_port.split(']').next().map(|s| s.trim_start_matches('['))
        } else {
            host_port.split(':').next()
        };
        if let Some(h) = host {
            if let Ok(ip) = h.parse::<std::net::IpAddr>() {
                match ip {
                    std::net::IpAddr::V4(v4) => {
                        if v4.is_link_local() {
                            return true;
                        }
                    }
                    std::net::IpAddr::V6(v6) => {
                        if (v6.segments()[0] & 0xffc0) == 0xfe80 {
                            return true;
                        }
                    }
                }
            }
        }
    }

    false
}

/// Checks if a locator is an excluded endpoint (loopback, link-local, or wildcard).
pub fn is_excluded_locator(loc: &str) -> bool {
    let lower = loc.to_lowercase();

    // Unix domain sockets are local IPC endpoints - keep them
    if lower.starts_with("unix/") || lower.starts_with("unixpipe/") {
        return false;
    }

    // 1. IPv6 and IPv4 Loopback
    if lower.contains("[::1]") || lower.contains("/127.0.0.1") || lower.contains("127.0.0.1:") || lower.contains("localhost") {
        return true;
    }

    // 2. Link-local
    if is_link_local_locator(loc) {
        return true;
    }

    // 3. Wildcards
    if lower.contains("0.0.0.0") || lower.contains("[::]") {
        return true;
    }

    // Check parsed IP
    if let Some(host_port) = loc.split('/').last() {
        let host = if host_port.starts_with('[') {
            host_port.split(']').next().map(|s| s.trim_start_matches('['))
        } else {
            host_port.split(':').next()
        };
        if let Some(h) = host {
            if let Ok(ip) = h.parse::<std::net::IpAddr>() {
                match ip {
                    std::net::IpAddr::V4(v4) => {
                        if v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast() {
                            return true;
                        }
                    }
                    std::net::IpAddr::V6(v6) => {
                        if v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xffc0) == 0xfe80 {
                            return true;
                        }
                    }
                }
            }
        }
    }

    false
}

/// Resolves wildcard `0.0.0.0` or `[::]` in bound listening locators to real reachable host IPs,
/// keeping strictly real IPv4 and real IPv6 endpoints (and unix sockets), and excluding link-local
/// and loopback endpoints.
pub fn resolve_bound_locators(raw_locators: Vec<String>) -> Vec<String> {
    let primary_ip = get_primary_local_ip().map(|ip| ip.to_string());
    let mut resolved = Vec::new();

    for loc in &raw_locators {
        if loc.contains("0.0.0.0") {
            if let Some(ip) = &primary_ip {
                let lan_loc = loc.replace("0.0.0.0", ip);
                if !is_excluded_locator(&lan_loc) && !resolved.contains(&lan_loc) {
                    resolved.push(lan_loc);
                }
            }
        } else if loc.contains("[::]") {
            if let Some(ip) = &primary_ip {
                let lan_loc = loc.replace("[::]", ip);
                if !is_excluded_locator(&lan_loc) && !resolved.contains(&lan_loc) {
                    resolved.push(lan_loc);
                }
            }
        } else if !is_excluded_locator(loc) {
            if !resolved.contains(loc) {
                resolved.push(loc.clone());
            }
        }
    }

    // Fallback: If no real external/LAN IPs were resolved (e.g. offline machine), provide 127.0.0.1
    if resolved.is_empty() {
        for loc in raw_locators {
            if loc.contains("0.0.0.0") {
                let loopback = loc.replace("0.0.0.0", "127.0.0.1");
                if !resolved.contains(&loopback) {
                    resolved.push(loopback);
                }
            } else if loc.contains("[::]") {
                let loopback = loc.replace("[::]", "127.0.0.1");
                if !resolved.contains(&loopback) {
                    resolved.push(loopback);
                }
            } else if !is_link_local_locator(&loc) && !resolved.contains(&loc) {
                resolved.push(loc);
            }
        }
    }

    resolved
}

/// Checks if a locator uses an ephemeral outbound dynamic socket port (>= 32768).
pub fn is_ephemeral_port_locator(loc: &str) -> bool {
    let clean = loc.trim();
    if clean.starts_with("unix/") || clean.starts_with("unixpipe/") {
        return false;
    }
    if let Some(last_colon) = clean.rfind(':') {
        let port_part = clean[last_colon + 1..]
            .split(&['/', '?', '#'][..])
            .next()
            .unwrap_or("");
        if let Ok(port) = port_part.parse::<u16>() {
            return port >= 32768;
        }
    }
    false
}


