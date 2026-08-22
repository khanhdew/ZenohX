use tauri::State;
use crate::db::models::{ConnectionProfile, StoredMessage};
use crate::AppState;

/// Saves or updates a connection profile in the SQLite database.
#[tauri::command]
pub async fn save_profile(
    state: State<'_, AppState>,
    profile: ConnectionProfile,
) -> Result<(), String> {
    state
        .db
        .save_profile(&profile)
        .map_err(|e| format!("failed to save profile: {e}"))
}

/// Retrieves all connection profiles from the SQLite database.
#[tauri::command]
pub async fn load_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<ConnectionProfile>, String> {
    state
        .db
        .get_profiles()
        .map_err(|e| format!("failed to load profiles: {e}"))
}

/// Deletes a connection profile by ID from the SQLite database.
#[tauri::command]
pub async fn delete_profile(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<(), String> {
    state
        .db
        .delete_profile(&profile_id)
        .map_err(|e| format!("failed to delete profile: {e}"))
}

/// Queries message history for a profile with pagination.
#[tauri::command]
pub async fn query_messages(
    state: State<'_, AppState>,
    profile_id: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<StoredMessage>, String> {
    state
        .db
        .get_messages(&profile_id, limit, offset)
        .map_err(|e| format!("failed to query messages: {e}"))
}
