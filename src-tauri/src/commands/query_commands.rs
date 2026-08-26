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

use crate::AppState;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use crate::db::models::{QueryablePreset, StoredQueryExecution};
use crate::zenoh::types::ReplySample;

/// Executes a distributed Zenoh query (`session.get`) and returns all collected replies with latency metrics.
#[tauri::command]
pub async fn query_get(
    state: State<'_, AppState>,
    session_id: Uuid,
    selector: String,
    target: String,
    timeout_ms: u64,
    payload: Option<Vec<u8>>,
    encoding: Option<String>,
    consolidation: Option<String>,
) -> Result<Vec<ReplySample>, String> {
    state
        .session_manager
        .query_get_advanced(
            &session_id,
            &selector,
            &target,
            timeout_ms,
            payload,
            encoding,
            consolidation,
        )
        .await
}


/// Declares a queryable on a Zenoh session and routes inbound queries to the frontend via the `zenohx://query` Tauri event.
#[tauri::command]
pub async fn declare_queryable(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    queryable_id: Uuid,
    key_expr: String,
) -> Result<(), String> {
    let app_handle = app.clone();
    state
        .session_manager
        .declare_queryable_routed(&session_id, queryable_id, &key_expr, move |inbound| {
            let _ = app_handle.emit("zenohx://query", inbound);
        })
        .await
}

/// Undeclares an active queryable by its `queryable_id` and terminates its background listener task.
#[tauri::command]
pub async fn undeclare_queryable(
    state: State<'_, AppState>,
    session_id: Uuid,
    queryable_id: Uuid,
) -> Result<(), String> {
    state
        .session_manager
        .undeclare_queryable(&session_id, queryable_id)
        .await
}

/// Sends a reply payload to a pending inbound query identified by its unique token.
#[tauri::command]
pub async fn reply_query(
    state: State<'_, AppState>,
    token: Uuid,
    key_expr: String,
    payload: Vec<u8>,
    encoding: String,
) -> Result<(), String> {
    state
        .session_manager
        .reply_query(&token, &key_expr, payload, &encoding)
        .await
}

/// Saves or updates a queryable preset in SQLite.
#[tauri::command]
pub async fn save_queryable_preset(
    state: State<'_, AppState>,
    preset: QueryablePreset,
) -> Result<(), String> {
    state
        .db
        .save_queryable_preset(&preset)
        .map_err(|e| format!("failed to save queryable preset: {e}"))
}

/// Loads all queryable presets for a profile (or all profiles) from SQLite.
#[tauri::command]
pub async fn load_queryable_presets(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> Result<Vec<QueryablePreset>, String> {
    let pid = profile_id.unwrap_or_default();
    state
        .db
        .get_queryable_presets(&pid)
        .map_err(|e| format!("failed to load queryable presets: {e}"))
}

/// Deletes a queryable preset by ID from SQLite.
#[tauri::command]
pub async fn delete_queryable_preset(
    state: State<'_, AppState>,
    preset_id: String,
) -> Result<(), String> {
    state
        .db
        .delete_queryable_preset(&preset_id)
        .map_err(|e| format!("failed to delete queryable preset: {e}"))
}

/// Saves a query execution record to SQLite.
#[tauri::command]
pub async fn save_query_execution(
    state: State<'_, AppState>,
    execution: StoredQueryExecution,
) -> Result<(), String> {
    state
        .db
        .save_query_execution(&execution)
        .map_err(|e| format!("failed to save query execution: {e}"))
}

/// Queries query execution history from SQLite with pagination.
#[tauri::command]
pub async fn load_query_history(
    state: State<'_, AppState>,
    profile_id: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<StoredQueryExecution>, String> {
    let limit_val = limit.unwrap_or(50);
    let offset_val = offset.unwrap_or(0);
    state
        .db
        .get_query_history(profile_id.as_deref(), limit_val, offset_val)
        .map_err(|e| format!("failed to query history: {e}"))
}

/// Clears query history for a profile or all profiles from SQLite.
#[tauri::command]
pub async fn clear_query_history(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> Result<(), String> {
    state
        .db
        .clear_query_history(profile_id.as_deref())
        .map_err(|e| format!("failed to clear query history: {e}"))
}

/// Deletes a specific query execution record by ID from SQLite.
#[tauri::command]
pub async fn delete_query_execution(
    state: State<'_, AppState>,
    execution_id: String,
) -> Result<(), String> {
    state
        .db
        .delete_query_execution_by_id(&execution_id)
        .map_err(|e| format!("failed to delete query execution: {e}"))
}
