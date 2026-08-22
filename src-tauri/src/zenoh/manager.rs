use super::pubsub::{publish_sample, subscribe_with_callback, ActiveSubscriber};
use super::scout::scout_nodes;
use super::types::{ScoutedNode, SessionConfig, SessionInfo, ZenohSample};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Context representing an active Zenoh session and its associated metadata.
pub struct SessionContext {
    pub id: Uuid,
    pub session: zenoh::Session,
    pub config: SessionConfig,
    pub created_at: i64,
    pub subscribers: HashMap<Uuid, ActiveSubscriber>,
}

/// Centralized manager for handling multiple concurrent Zenoh sessions.
#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<Uuid, SessionContext>>>,
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
        }
    }

    /// Connects to a Zenoh network using the provided configuration.
    ///
    /// Returns the unique `Uuid` identifier assigned to this session.
    pub async fn connect(&self, config: SessionConfig) -> Result<Uuid, String> {
        let zenoh_config = config.to_zenoh_config()?;
        let session = zenoh::open(zenoh_config)
            .await
            .map_err(|e| format!("failed to open zenoh session: {e}"))?;

        let session_id = Uuid::new_v4();
        let now = chrono::Utc::now().timestamp();

        let context = SessionContext {
            id: session_id,
            session,
            config,
            created_at: now,
            subscribers: HashMap::new(),
        };

        let mut lock = self.sessions.write().await;
        lock.insert(session_id, context);

        Ok(session_id)
    }

    /// Disconnects and explicitly closes an active Zenoh session by its ID.
    pub async fn disconnect(&self, session_id: &Uuid) -> Result<(), String> {
        let mut lock = self.sessions.write().await;
        if let Some(context) = lock.remove(session_id) {
            // Stop all active background subscriber tasks for this session
            for (_, sub) in context.subscribers {
                sub.stop().await;
            }
            context
                .session
                .close()
                .await
                .map_err(|e| format!("failed to close zenoh session: {e}"))?;
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

    /// Checks if a session is currently open and managed.
    pub async fn has_session(&self, session_id: &Uuid) -> bool {
        let lock = self.sessions.read().await;
        lock.contains_key(session_id)
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
