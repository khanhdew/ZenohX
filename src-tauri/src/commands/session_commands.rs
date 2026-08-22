use tauri::State;
use uuid::Uuid;
use crate::zenoh::types::{ScoutedNode, SessionConfig, SessionInfo};
use crate::AppState;

/// Opens a new Zenoh session with the specified configuration and returns the session ID.
#[tauri::command]
pub async fn connect_session(
    state: State<'_, AppState>,
    config: SessionConfig,
) -> Result<Uuid, String> {
    state.session_manager.connect(config).await
}

/// Disconnects and terminates an active Zenoh session.
#[tauri::command]
pub async fn disconnect_session(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> Result<(), String> {
    state.session_manager.disconnect(&session_id).await
}

/// Scans the local network for active Zenoh routers and peers.
#[tauri::command]
pub async fn scout_locators(
    state: State<'_, AppState>,
    timeout_ms: u64,
) -> Result<Vec<ScoutedNode>, String> {
    state.session_manager.scout_locators(timeout_ms).await
}

/// Retrieves metadata for a specific Zenoh session.
#[tauri::command]
pub async fn get_session_info(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> Result<SessionInfo, String> {
    state.session_manager.get_session_info(&session_id).await
}

/// Retrieves metadata for all active Zenoh sessions.
#[tauri::command]
pub async fn get_all_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<SessionInfo>, String> {
    Ok(state.session_manager.get_all_sessions().await)
}
