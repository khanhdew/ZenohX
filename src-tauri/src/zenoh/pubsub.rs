use std::sync::Arc;
use uuid::Uuid;
use super::types::{PublishOptions, SubscribeOptions, ZenohSample};

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

/// Parses string priority into a Zenoh `Priority`.
pub fn parse_priority(priority: Option<&str>) -> zenoh::qos::Priority {
    match priority.map(|s| s.to_lowercase().trim().to_string()).as_deref() {
        Some("realtime") | Some("real_time") => zenoh::qos::Priority::RealTime,
        Some("interactive_high") | Some("interactivehigh") => zenoh::qos::Priority::InteractiveHigh,
        Some("interactive_low") | Some("interactivelow") => zenoh::qos::Priority::InteractiveLow,
        Some("data_high") | Some("datahigh") => zenoh::qos::Priority::DataHigh,
        Some("data_low") | Some("datalow") => zenoh::qos::Priority::DataLow,
        Some("background") => zenoh::qos::Priority::Background,
        _ => zenoh::qos::Priority::Data,
    }
}

/// Parses string congestion control into a Zenoh `CongestionControl`.
pub fn parse_congestion_control(cc: Option<&str>) -> zenoh::qos::CongestionControl {
    match cc.map(|s| s.to_lowercase().trim().to_string()).as_deref() {
        Some("block") => zenoh::qos::CongestionControl::Block,
        _ => zenoh::qos::CongestionControl::Drop,
    }
}

/// Parses string reliability into a Zenoh `Reliability`.
pub fn parse_reliability(rel: Option<&str>) -> zenoh::qos::Reliability {
    match rel.map(|s| s.to_lowercase().trim().to_string()).as_deref() {
        Some("reliable") => zenoh::qos::Reliability::Reliable,
        _ => zenoh::qos::Reliability::BestEffort,
    }
}

/// Converts a native Zenoh `Sample` into our serializable `ZenohSample` representation.
pub fn extract_sample(
    session_id: Uuid,
    sub_id: Option<Uuid>,
    sample: &zenoh::sample::Sample,
) -> Option<ZenohSample> {
    let (timestamp, source_id) = if let Some(t) = sample.timestamp() {
        let ts_millis = (t.get_time().as_nanos() / 1_000_000) as i64;
        let zid = t.get_id().to_string();
        let sid = if zid == "0" || zid.is_empty() {
            None
        } else {
            Some(zid)
        };
        (ts_millis, sid)
    } else {
        (chrono::Utc::now().timestamp_millis(), None)
    };

    let key_expr = sample.key_expr().to_string();
    let payload = sample.payload().to_bytes().to_vec();
    let kind = match sample.kind() {
        zenoh::sample::SampleKind::Put => "put".to_string(),
        zenoh::sample::SampleKind::Delete => "delete".to_string(),
    };
    let encoding = sample.encoding().to_string();
    let attachment = sample.attachment().map(|a| a.to_bytes().to_vec());
    let express = Some(sample.express());
    let priority = Some(format!("{:?}", sample.priority()).to_lowercase());

    Some(ZenohSample {
        session_id,
        sub_id,
        key_expr,
        payload,
        encoding,
        kind,
        timestamp,
        source_id,
        priority,
        express,
        attachment,
    })
}

/// Publishes a payload with the specified encoding, operation kind (put or delete), and QoS options.
pub async fn publish_sample(
    session: &zenoh::Session,
    key_expr: &str,
    payload: Vec<u8>,
    encoding: &str,
    kind: &str,
) -> Result<(), String> {
    publish_sample_with_options(session, key_expr, payload, encoding, kind, None).await
}

/// Advanced publisher supporting QoS priorities, congestion control, attachments, and express mode.
pub async fn publish_sample_with_options(
    session: &zenoh::Session,
    key_expr: &str,
    payload: Vec<u8>,
    encoding: &str,
    kind: &str,
    options: Option<PublishOptions>,
) -> Result<(), String> {
    let kind_lower = kind.to_lowercase();
    match kind_lower.as_str() {
        "delete" => {
            session
                .delete(key_expr)
                .timestamp(session.new_timestamp())
                .await
                .map_err(|e| format!("failed to publish delete on '{key_expr}': {e}"))?;
        }
        _ => {
            let zenoh_encoding = parse_encoding(encoding);
            let mut builder = session
                .put(key_expr, payload)
                .encoding(zenoh_encoding)
                .timestamp(session.new_timestamp());

            if let Some(opts) = options {
                if let Some(pri) = &opts.priority {
                    builder = builder.priority(parse_priority(Some(pri)));
                }
                if let Some(cc) = &opts.congestion_control {
                    builder = builder.congestion_control(parse_congestion_control(Some(cc)));
                }
                if let Some(exp) = opts.express {
                    builder = builder.express(exp);
                }
                if let Some(att) = opts.attachment {
                    builder = builder.attachment(att);
                }
            }

            builder
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
    subscribe_with_callback_and_options(session, session_id, sub_id, key_expr, None, callback).await
}

/// Parses string locality into a Zenoh `Locality`.
pub fn parse_locality(origin: Option<&str>) -> zenoh::sample::Locality {
    match origin.map(|s| s.to_lowercase().trim().to_string()).as_deref() {
        Some("session_local") | Some("local") => zenoh::sample::Locality::SessionLocal,
        Some("remote") => zenoh::sample::Locality::Remote,
        _ => zenoh::sample::Locality::Any,
    }
}

/// Declares a subscriber on the Zenoh session with configurable allowed origin locality.
pub async fn subscribe_with_callback_and_options<F>(
    session: &zenoh::Session,
    session_id: Uuid,
    sub_id: Uuid,
    key_expr: &str,
    options: Option<SubscribeOptions>,
    callback: F,
) -> Result<ActiveSubscriber, String>
where
    F: Fn(ZenohSample) + Send + Sync + 'static,
{
    let mut builder = session.declare_subscriber(key_expr);

    if let Some(opts) = options {
        if let Some(origin) = &opts.allowed_origin {
            builder = builder.allowed_origin(parse_locality(Some(origin)));
        }
    }

    let subscriber = builder
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
                            if let Some(extracted) = extract_sample(session_id, Some(sub_id), &sample) {
                                (callback_arc)(extracted);
                            }
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
