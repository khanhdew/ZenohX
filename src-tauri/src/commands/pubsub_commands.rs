use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use crate::db::models::StoredMessage;
use crate::zenoh::types::{PublishOptions, StreamGeneratorConfig, SubscribeOptions, ZenohSample};
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
    publish_sample_advanced(state, session_id, key_expr, payload, encoding, kind, None).await
}

/// Publishes a data sample with advanced QoS options (priority, congestion control, express, attachment).
#[tauri::command]
pub async fn publish_sample_advanced(
    state: State<'_, AppState>,
    session_id: Uuid,
    key_expr: String,
    payload: Vec<u8>,
    encoding: String,
    kind: String,
    options: Option<PublishOptions>,
) -> Result<(), String> {
    state
        .session_manager
        .publish_with_options(
            &session_id,
            &key_expr,
            payload.clone(),
            &encoding,
            &kind,
            options,
        )
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

/// Declares a subscriber on the specified session, streaming samples in batches to frontend and persisting to SQLite.
#[tauri::command]
pub async fn subscribe(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    sub_id: Uuid,
    key_expr: String,
) -> Result<(), String> {
    subscribe_advanced(app, state, session_id, sub_id, key_expr, None).await
}

/// Declares an advanced subscriber with QoS options and high-throughput frame-rate aligned batching.
#[tauri::command]
pub async fn subscribe_advanced(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    sub_id: Uuid,
    key_expr: String,
    options: Option<SubscribeOptions>,
) -> Result<(), String> {
    let app_handle = app.clone();
    let db = state.db.clone();
    let profile_id = state
        .session_manager
        .get_session_profile_id(&session_id)
        .await
        .unwrap_or_default();

    // High-performance batched ingestion channel
    let (batch_tx, mut batch_rx) = tokio::sync::mpsc::channel::<ZenohSample>(10000);

    // Background batch flusher task (flushes every 16ms / 60 FPS or on 50 samples)
    tokio::spawn(async move {
        let mut buffer: Vec<ZenohSample> = Vec::with_capacity(64);
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(16));
        interval.tick().await;

        loop {
            tokio::select! {
                sample_opt = batch_rx.recv() => {
                    match sample_opt {
                        Some(sample) => {
                            buffer.push(sample);
                            if buffer.len() >= 50 {
                                flush_sample_buffer(&mut buffer, &db, &profile_id, &app_handle);
                            }
                        }
                        None => {
                            // Channel closed on unsubscribe
                            if !buffer.is_empty() {
                                flush_sample_buffer(&mut buffer, &db, &profile_id, &app_handle);
                            }
                            break;
                        }
                    }
                }
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        flush_sample_buffer(&mut buffer, &db, &profile_id, &app_handle);
                    }
                }
            }
        }
    });

    state
        .session_manager
        .subscribe_with_options(&session_id, sub_id, &key_expr, options, move |sample| {
            let _ = batch_tx.try_send(sample);
        })
        .await
}

/// Flushes buffered samples to SQLite in a single transaction and emits batched IPC events.
fn flush_sample_buffer(
    buffer: &mut Vec<ZenohSample>,
    db: &crate::db::Database,
    profile_id: &str,
    app_handle: &AppHandle,
) {
    let stored_list: Vec<StoredMessage> = buffer
        .iter()
        .map(|sample| StoredMessage {
            id: None,
            profile_id: profile_id.to_string(),
            direction: "incoming".to_string(),
            key_expr: sample.key_expr.clone(),
            payload: sample.payload.clone(),
            encoding: sample.encoding.clone(),
            kind: sample.kind.clone(),
            timestamp: sample.timestamp,
        })
        .collect();

    let _ = db.insert_messages_batch(&stored_list);
    let _ = app_handle.emit("zenohx://samples-batched", &buffer);
    buffer.clear();
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

/// Starts a background stream generator that publishes samples at a fixed rate.
#[tauri::command]
pub async fn start_stream_generator(
    state: State<'_, AppState>,
    config: StreamGeneratorConfig,
) -> Result<(), String> {
    state.session_manager.start_stream_generator(config).await
}

/// Stops an active background stream generator by generator_id.
#[tauri::command]
pub async fn stop_stream_generator(
    state: State<'_, AppState>,
    generator_id: Uuid,
) -> Result<(), String> {
    state.session_manager.stop_stream_generator(&generator_id).await
}
