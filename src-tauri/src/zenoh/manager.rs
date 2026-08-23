use super::pubsub::{publish_sample, subscribe_with_callback, ActiveSubscriber};
use super::query::{
    declare_queryable_with_handler, execute_query, ActiveQueryable, QueryHandle,
};
use super::scout::scout_nodes;
use super::types::{
    InboundQuery, ReplySample, ScoutedNode, SessionConfig, SessionInfo, SessionStatusEvent,
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
        // If a session for this profile_id is already running, disconnect it first to ensure exactly 1 session per profile
        if let Some(pid) = &config.profile_id {
            let existing_ids: Vec<Uuid> = {
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
            for id in existing_ids {
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
        let has_connect_locators = !config.connect_locators.is_empty();

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

                        if is_client {
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
                        } else if has_connect_locators {
                            let mut peer_count = 0;
                            let mut peers = session.info().peers_zid().await;
                            while let Some(_) = peers.next() {
                                peer_count += 1;
                            }

                            let mut router_count = 0;
                            let mut routers = session.info().routers_zid().await;
                            while let Some(_) = routers.next() {
                                router_count += 1;
                            }

                            if peer_count > 0 || router_count > 0 {
                                had_connection = true;
                            } else if had_connection {
                                handle_unexpected_disconnect(
                                    session_id,
                                    &sessions_arc,
                                    &pending_queries_arc,
                                    &status_cb_arc,
                                    "Zenoh connection lost: remote endpoint unreachable",
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
        let mut lock = self.sessions.write().await;
        let context = lock
            .get_mut(session_id)
            .ok_or_else(|| format!("session with id '{session_id}' not found"))?;

        // If an existing subscriber with the same sub_id exists, stop it first
        if let Some(old_sub) = context.subscribers.remove(&sub_id) {
            old_sub.stop().await;
        }

        let active_sub =
            subscribe_with_callback(&context.session, *session_id, sub_id, key_expr, callback)
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
        let session = self.get_session(session_id).await?;
        publish_sample(&session, key_expr, payload, encoding, kind).await
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
                let inbound = InboundQuery {
                    token,
                    session_id: handle.session_id,
                    queryable_id: handle.queryable_id,
                    key_expr: handle.key_expr.clone(),
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

    /// Retrieves session information for a given session ID.
    pub async fn get_session_info(&self, session_id: &Uuid) -> Result<SessionInfo, String> {
        let lock = self.sessions.read().await;
        let ctx = lock
            .get(session_id)
            .ok_or_else(|| format!("session with id '{session_id}' not found"))?;

        let zid = ctx.session.zid().to_string();

        Ok(SessionInfo {
            id: ctx.id,
            profile_id: ctx.profile_id.clone(),
            zid,
            mode: ctx.config.mode.clone(),
            scout_multicast: ctx.config.scout_multicast,
            connect_locators: ctx.config.connect_locators.clone(),
            listen_locators: ctx.config.listen_locators.clone(),
            created_at: ctx.created_at,
        })
    }

    /// Retrieves information for all currently managed sessions.
    pub async fn get_all_sessions(&self) -> Vec<SessionInfo> {
        let lock = self.sessions.read().await;
        lock.values()
            .map(|ctx| SessionInfo {
                id: ctx.id,
                profile_id: ctx.profile_id.clone(),
                zid: ctx.session.zid().to_string(),
                mode: ctx.config.mode.clone(),
                scout_multicast: ctx.config.scout_multicast,
                connect_locators: ctx.config.connect_locators.clone(),
                listen_locators: ctx.config.listen_locators.clone(),
                created_at: ctx.created_at,
            })
            .collect()
    }

    /// Scans the local network for Zenoh routers and peers via multicast.
    pub async fn scout_locators(&self, timeout_ms: u64) -> Result<Vec<ScoutedNode>, String> {
        scout_nodes(timeout_ms).await
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

