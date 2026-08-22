use crate::AppState;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use crate::zenoh::types::ReplySample;

/// Executes a distributed Zenoh query (`session.get`) and returns all collected replies with latency metrics.
#[tauri::command]
pub async fn query_get(
    state: State<'_, AppState>,
    session_id: Uuid,
    selector: String,
    target: String,
    timeout_ms: u64,
) -> Result<Vec<ReplySample>, String> {
    state
        .session_manager
        .query_get(&session_id, &selector, &target, timeout_ms)
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
