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
use crate::db::models::{ConnectionProfile, StoredMessage, SubscriptionPreset};
use crate::AppState;

/// Saves or updates a connection profile in the SQLite database.
#[tauri::command]
pub async fn save_profile(
    state: State<'_, AppState>,
    profile: ConnectionProfile,
) -> Result<(), String> {
    profile.validate()?;
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

/// Saves or updates a subscription preset in SQLite.
#[tauri::command]
pub async fn save_subscription_preset(
    state: State<'_, AppState>,
    preset: SubscriptionPreset,
) -> Result<(), String> {
    state
        .db
        .save_preset(&preset)
        .map_err(|e| format!("failed to save subscription preset: {e}"))
}

/// Loads all subscription presets for a profile (or all if empty) from SQLite.
#[tauri::command]
pub async fn load_subscription_presets(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> Result<Vec<SubscriptionPreset>, String> {
    let pid = profile_id.unwrap_or_default();
    state
        .db
        .get_presets(&pid)
        .map_err(|e| format!("failed to load subscription presets: {e}"))
}

/// Deletes a subscription preset by ID from SQLite.
#[tauri::command]
pub async fn delete_subscription_preset(
    state: State<'_, AppState>,
    preset_id: String,
) -> Result<(), String> {
    state
        .db
        .delete_preset(&preset_id)
        .map_err(|e| format!("failed to delete subscription preset: {e}"))
}

/// Queries message history for a profile (or all profiles) with pagination.
#[tauri::command]
pub async fn query_messages(
    state: State<'_, AppState>,
    profile_id: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<StoredMessage>, String> {
    let limit_val = limit.unwrap_or(100);
    let offset_val = offset.unwrap_or(0);
    state
        .db
        .get_messages(profile_id.as_deref(), limit_val, offset_val)
        .map_err(|e| format!("failed to query messages: {e}"))
}

/// Saves a message directly into the SQLite message history.
#[tauri::command]
pub async fn save_message(
    state: State<'_, AppState>,
    message: StoredMessage,
) -> Result<i64, String> {
    state
        .db
        .insert_message(&message)
        .map_err(|e| format!("failed to save message: {e}"))
}

/// Clears message history for a specific profile or all profiles.
#[tauri::command]
pub async fn clear_message_history(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> Result<(), String> {
    match profile_id {
        Some(ref pid) if !pid.trim().is_empty() && pid != "__all__" => {
            state.db.delete_messages_by_profile(pid)
        }
        _ => state.db.clear_all_messages(),
    }
    .map_err(|e| format!("failed to clear message history: {e}"))
}

/// Deletes a specific message by its row ID.
#[tauri::command]
pub async fn delete_message(
    state: State<'_, AppState>,
    message_id: i64,
) -> Result<(), String> {
    state
        .db
        .delete_message_by_id(message_id)
        .map_err(|e| format!("failed to delete message: {e}"))
}
