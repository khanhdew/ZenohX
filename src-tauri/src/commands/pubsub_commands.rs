use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use crate::db::models::StoredMessage;
use crate::AppState;

/// Publishes a data sample or delete signal to a Zenoh key expression and records it in history.
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
        .publish(&session_id, &key_expr, payload.clone(), &encoding, &kind)
        .await?;

    let profile_id = state
        .session_manager
        .get_session_profile_id(&session_id)
        .await
        .unwrap_or_default();

    let now = chrono::Utc::now().timestamp_millis();
    let stored = StoredMessage {
        id: None,
        profile_id,
        direction: "outgoing".to_string(),
        key_expr,
        payload,
        encoding,
        kind,
        timestamp: now,
    };
    let _ = state.db.insert_message(&stored);

    Ok(())
}

/// Declares a subscriber on the specified session, streams samples to frontend, and persists them to history.
#[tauri::command]
pub async fn subscribe(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    sub_id: Uuid,
    key_expr: String,
) -> Result<(), String> {
    let app_handle = app.clone();
    let db = state.db.clone();
    let profile_id = state
        .session_manager
        .get_session_profile_id(&session_id)
        .await
        .unwrap_or_default();

    state
        .session_manager
        .subscribe(&session_id, sub_id, &key_expr, move |sample| {
            let stored = StoredMessage {
                id: None,
                profile_id: profile_id.clone(),
                direction: "incoming".to_string(),
                key_expr: sample.key_expr.clone(),
                payload: sample.payload.clone(),
                encoding: sample.encoding.clone(),
                kind: sample.kind.clone(),
                timestamp: sample.timestamp,
            };
            let _ = db.insert_message(&stored);
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
