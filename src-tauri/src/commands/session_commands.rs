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

use tauri::State;
use uuid::Uuid;
use crate::zenoh::types::{AdminSpaceEntry, ScoutedNode, SessionConfig, SessionInfo};
use crate::AppState;

/// Opens a new Zenoh session with the specified configuration and returns the session ID.
#[tauri::command]
pub async fn connect_session(
    state: State<'_, AppState>,
    config: SessionConfig,
) -> Result<Uuid, String> {
    state.session_manager.connect(config).await
}

/// Connects a Zenoh node by looking up its configuration (JSON5/profile) in SQLite by ZID or profile ID.
/// Returns full live `SessionInfo` directly to the caller.
#[tauri::command]
pub async fn connect_node_by_zid(
    state: State<'_, AppState>,
    zid: String,
) -> Result<SessionInfo, String> {
    let raw_id = zid
        .strip_prefix("profile-")
        .or_else(|| zid.strip_prefix("scouted-"))
        .or_else(|| zid.strip_prefix("admin-"))
        .unwrap_or(&zid);

    let profile = state
        .db
        .get_profile_by_id(raw_id)
        .map_err(|e| format!("failed to load profile from database: {e}"))?
        .or_else(|| {
            if raw_id != zid {
                state.db.get_profile_by_id(&zid).ok().flatten()
            } else {
                None
            }
        })
        .ok_or_else(|| format!("node configuration for '{zid}' not found in database"))?;

    let user_auth = profile.user_auth.as_ref().and_then(|v| serde_json::from_value(v.clone()).ok());
    let tls_config = profile.tls_config.as_ref().and_then(|v| serde_json::from_value(v.clone()).ok());

    let config = SessionConfig {
        profile_id: Some(profile.id.clone()),
        mode: profile.mode.clone(),
        connect_locators: profile.connect_locators.clone(),
        listen_locators: profile.listen_locators.clone(),
        scout_multicast: profile.scout_multicast,
        scout_gossip: true,
        reconnect_retry: None,
        user_auth,
        tls_config,
        custom_config: profile.custom_config.clone(),
    };

    let session_id = state.session_manager.connect(config).await?;
    let session_info = state.session_manager.get_session_info(&session_id).await?;

    // Post-Connect: If router was configured with ephemeral listen endpoints (:0 or empty),
    // retain the newly allocated bound IP:port in SQLite database so subsequent
    // reconnects reuse the allocated port.
    let mut updated_profile = profile.clone();
    if profile.mode.to_lowercase() == "router" {
        if !session_info.bound_locators.is_empty() {
            let was_ephemeral = profile.listen_locators.is_empty()
                || profile
                    .listen_locators
                    .iter()
                    .any(|l| l.contains(":0") || l.ends_with("/0"));
            if was_ephemeral {
                updated_profile.listen_locators = session_info.bound_locators.clone();
                let _ = state.db.save_profile(&updated_profile);
            }
        }
    }

    Ok(session_info)
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

/// Queries Zenoh Admin Space (@/**) to discover remote routers, links, and node topology.
#[tauri::command]
pub async fn query_admin_space(
    state: State<'_, AppState>,
    session_id: Uuid,
    selector: Option<String>,
    timeout_ms: u64,
) -> Result<Vec<AdminSpaceEntry>, String> {
    state
        .session_manager
        .query_admin_space(&session_id, selector.as_deref(), timeout_ms)
        .await
}

/// Retrieves authoritative node configuration (JSON5) by ZID directly from Rust backend.
#[tauri::command]
pub async fn get_node_configuration(
    state: State<'_, AppState>,
    zid: String,
) -> Result<crate::zenoh::types::NodeConfigurationResult, String> {
    // 1. Check live session manager first
    if let Ok(res) = state.session_manager.get_node_configuration(&zid).await {
        if res.is_local || !res.locators.is_empty() {
            return Ok(res);
        }
    }

    // 2. Check saved connection profile in SQLite database
    let raw_id = zid
        .strip_prefix("profile-")
        .or_else(|| zid.strip_prefix("scouted-"))
        .or_else(|| zid.strip_prefix("admin-"))
        .unwrap_or(&zid);

    let profile = state
        .db
        .get_profile_by_id(raw_id)
        .ok()
        .flatten()
        .or_else(|| {
            if raw_id != zid {
                state.db.get_profile_by_id(&zid).ok().flatten()
            } else {
                None
            }
        });

    if let Some(p) = profile {
        let is_router = p.mode.to_lowercase() == "router";
        let listen_locators = if is_router {
            p.listen_locators.clone()
        } else {
            vec![]
        };
        let config = crate::zenoh::types::SessionConfig {
            profile_id: Some(p.id.clone()),
            mode: p.mode.clone(),
            connect_locators: p.connect_locators.clone(),
            listen_locators: listen_locators.clone(),
            scout_multicast: p.scout_multicast,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: p.custom_config.clone(),
        };
        let json5 = config.generate_json5(Some(&p.id), &listen_locators);
        return Ok(crate::zenoh::types::NodeConfigurationResult {
            zid: p.id.clone(),
            profile_id: Some(p.id),
            mode: p.mode,
            status: "disconnected".to_string(),
            locators: listen_locators,
            connect_locators: p.connect_locators,
            json5,
            is_local: true,
        });
    }

    // 3. Fallback to session manager scout / admin space
    state.session_manager.get_node_configuration(&zid).await
}
