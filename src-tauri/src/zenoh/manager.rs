use super::scout::scout_nodes;
use super::types::{ScoutedNode, SessionConfig, SessionInfo};
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
        };

        let mut lock = self.sessions.write().await;
        lock.insert(session_id, context);

        Ok(session_id)
    }

    /// Disconnects and explicitly closes an active Zenoh session by its ID.
    pub async fn disconnect(&self, session_id: &Uuid) -> Result<(), String> {
        let mut lock = self.sessions.write().await;
        if let Some(context) = lock.remove(session_id) {
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
