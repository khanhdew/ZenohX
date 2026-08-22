use std::sync::Arc;
use uuid::Uuid;
use super::types::ZenohSample;

/// Tracks an active Zenoh subscription task and metadata.
pub struct ActiveSubscriber {
    pub sub_id: Uuid,
    pub key_expr: String,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
    task_handle: tokio::task::JoinHandle<()>,
}

impl ActiveSubscriber {
    /// Stops the subscriber worker task, undeclaring the Zenoh subscriber.
    pub async fn stop(mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        let _ = self.task_handle.await;
    }
}

/// Parses shorthand and standard MIME strings into a Zenoh `Encoding`.
pub fn parse_encoding(encoding: &str) -> zenoh::bytes::Encoding {
    match encoding.to_lowercase().trim() {
        "text" | "text/plain" => zenoh::bytes::Encoding::TEXT_PLAIN,
        "json" | "application/json" => zenoh::bytes::Encoding::APPLICATION_JSON,
        "cbor" | "application/cbor" => zenoh::bytes::Encoding::APPLICATION_CBOR,
        "raw" | "bytes" | "application/octet-stream" => zenoh::bytes::Encoding::ZENOH_BYTES,
        custom if !custom.is_empty() => zenoh::bytes::Encoding::from(custom),
        _ => zenoh::bytes::Encoding::ZENOH_BYTES,
    }
}

/// Converts a native Zenoh `Sample` into our serializable `ZenohSample` representation.
pub fn extract_sample(
    session_id: Uuid,
    sub_id: Option<Uuid>,
    sample: &zenoh::sample::Sample,
) -> ZenohSample {
    let key_expr = sample.key_expr().to_string();
    let payload = sample.payload().to_bytes().to_vec();
    let kind = match sample.kind() {
        zenoh::sample::SampleKind::Put => "put".to_string(),
        zenoh::sample::SampleKind::Delete => "delete".to_string(),
    };
    let encoding = sample.encoding().to_string();
    let timestamp = sample
        .timestamp()
        .map(|t| (t.get_time().as_nanos() / 1_000_000) as i64)
        .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

    ZenohSample {
        session_id,
        sub_id,
        key_expr,
        payload,
        encoding,
        kind,
        timestamp,
    }
}

/// Publishes a payload with the specified encoding and operation kind (put or delete).
pub async fn publish_sample(
    session: &zenoh::Session,
    key_expr: &str,
    payload: Vec<u8>,
    encoding: &str,
    kind: &str,
) -> Result<(), String> {
    let kind_lower = kind.to_lowercase();
    match kind_lower.as_str() {
        "delete" => {
            session
                .delete(key_expr)
                .await
                .map_err(|e| format!("failed to publish delete on '{key_expr}': {e}"))?;
        }
        _ => {
            let zenoh_encoding = parse_encoding(encoding);
            session
                .put(key_expr, payload)
                .encoding(zenoh_encoding)
                .await
                .map_err(|e| format!("failed to publish sample on '{key_expr}': {e}"))?;
        }
    }
    Ok(())
}

/// Declares a subscriber on the Zenoh session and spawns a background task reading samples.
pub async fn subscribe_with_callback<F>(
    session: &zenoh::Session,
    session_id: Uuid,
    sub_id: Uuid,
    key_expr: &str,
    callback: F,
) -> Result<ActiveSubscriber, String>
where
    F: Fn(ZenohSample) + Send + Sync + 'static,
{
    let subscriber = session
        .declare_subscriber(key_expr)
        .await
        .map_err(|e| format!("failed to declare subscriber for '{key_expr}': {e}"))?;

    let callback_arc = Arc::new(callback);
    let key_expr_string = key_expr.to_string();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();

    let task_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let _ = subscriber.undeclare().await;
                    break;
                }
                sample_res = subscriber.recv_async() => {
                    match sample_res {
                        Ok(sample) => {
                            let extracted = extract_sample(session_id, Some(sub_id), &sample);
                            (callback_arc)(extracted);
                        }
                        Err(_) => {
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(ActiveSubscriber {
        sub_id,
        key_expr: key_expr_string,
        stop_tx: Some(stop_tx),
        task_handle,
    })
}
