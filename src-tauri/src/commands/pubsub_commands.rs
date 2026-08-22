use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use crate::AppState;

/// Publishes a data sample or delete signal to a Zenoh key expression.
#[tauri::command]
pub async fn publish_sample(
    state: State<'_, AppState>,
    session_id: Uuid,
    key_expr: String,
    payload: Vec<u8>,
    encoding: String,
    kind: String,
) -> Result<(), String> {
    state
        .session_manager
        .publish(&session_id, &key_expr, payload, &encoding, &kind)
        .await
}

/// Declares a subscriber on the specified session and streams incoming samples via the `zenohx://sample` Tauri event.
#[tauri::command]
pub async fn subscribe(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    sub_id: Uuid,
    key_expr: String,
) -> Result<(), String> {
    let app_handle = app.clone();
    state
        .session_manager
        .subscribe(&session_id, sub_id, &key_expr, move |sample| {
            let _ = app_handle.emit("zenohx://sample", sample);
        })
        .await
}

/// Unsubscribes an active subscriber by sub_id and closes its listener task.
#[tauri::command]
pub async fn unsubscribe(
    state: State<'_, AppState>,
    session_id: Uuid,
    sub_id: Uuid,
) -> Result<(), String> {
    state.session_manager.unsubscribe(&session_id, sub_id).await
}
