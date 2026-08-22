use super::pubsub::parse_encoding;
use super::types::{InboundQuery, ReplySample};
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::oneshot;
use uuid::Uuid;
use zenoh::query::{Query, QueryTarget};

/// Active queryable context holding the background listener task and stop channel.
pub struct ActiveQueryable {
    pub queryable_id: Uuid,
    pub key_expr: String,
    stop_tx: Option<oneshot::Sender<()>>,
    task_handle: tokio::task::JoinHandle<()>,
}

impl ActiveQueryable {
    /// Stops the queryable worker task and undeclares the Zenoh queryable.
    pub async fn stop(mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        let _ = self.task_handle.await;
    }
}

/// A wrapper around an inbound Zenoh `Query` allowing programmatic or delayed responses.
#[derive(Clone)]
pub struct QueryHandle {
    pub token: Uuid,
    pub session_id: Uuid,
    pub queryable_id: Uuid,
    pub key_expr: String,
    pub parameters: String,
    pub payload: Option<Vec<u8>>,
    pub encoding: Option<String>,
    pub timestamp: i64,
    query: Arc<parking_lot::Mutex<Option<Query>>>,
}

impl QueryHandle {
    /// Creates a new `QueryHandle` and its corresponding `InboundQuery` data transfer object.
    pub fn new(
        token: Uuid,
        session_id: Uuid,
        queryable_id: Uuid,
        query: Query,
    ) -> (Self, InboundQuery) {
        let key_expr = query.key_expr().to_string();
        let parameters = query.parameters().to_string();
        let payload = query.payload().map(|p| p.to_bytes().to_vec());
        let encoding = query.encoding().map(|e| e.to_string());
        let timestamp = chrono::Utc::now().timestamp_millis();

        let inbound = InboundQuery {
            token,
            session_id,
            queryable_id,
            key_expr: key_expr.clone(),
            parameters: parameters.clone(),
            payload: payload.clone(),
            encoding: encoding.clone(),
            timestamp,
        };

        let handle = Self {
            token,
            session_id,
            queryable_id,
            key_expr,
            parameters,
            payload,
            encoding,
            timestamp,
            query: Arc::new(parking_lot::Mutex::new(Some(query))),
        };

        (handle, inbound)
    }

    /// Replies to the Zenoh query with a given key expression and payload using default JSON encoding.
    pub async fn reply(&self, key_expr: &str, payload: Vec<u8>) -> Result<(), String> {
        self.reply_with_encoding(key_expr, payload, "application/json").await
    }

    /// Replies to the Zenoh query with a given key expression, payload, and custom encoding.
    pub async fn reply_with_encoding(
        &self,
        key_expr: &str,
        payload: Vec<u8>,
        encoding: &str,
    ) -> Result<(), String> {
        let query_opt = self.query.lock().take();
        if let Some(query) = query_opt {
            let enc = parse_encoding(encoding);
            query
                .reply(key_expr, payload)
                .encoding(enc)
                .await
                .map_err(|e| format!("failed to send query reply on '{key_expr}': {e}"))?;
            Ok(())
        } else {
            Err("query already replied or expired".to_string())
        }
    }

    /// Sends an error reply to the Zenoh query.
    pub async fn reply_err(&self, error_message: &str) -> Result<(), String> {
        let query_opt = self.query.lock().take();
        if let Some(query) = query_opt {
            query
                .reply_err(error_message.as_bytes().to_vec())
                .await
                .map_err(|e| format!("failed to send query error reply: {e}"))?;
            Ok(())
        } else {
            Err("query already replied or expired".to_string())
        }
    }

    /// Sends a delete reply to the Zenoh query.
    pub async fn reply_del(&self, key_expr: &str) -> Result<(), String> {
        let query_opt = self.query.lock().take();
        if let Some(query) = query_opt {
            query
                .reply_del(key_expr)
                .await
                .map_err(|e| format!("failed to send query delete reply on '{key_expr}': {e}"))?;
            Ok(())
        } else {
            Err("query already replied or expired".to_string())
        }
    }
}

/// Parses target selector string into a Zenoh `QueryTarget`.
pub fn parse_query_target(target: &str) -> QueryTarget {
    match target.to_lowercase().trim() {
        "best_matching" | "bestmatching" | "best" => QueryTarget::BestMatching,
        "all_complete" | "allcomplete" | "complete" => QueryTarget::AllComplete,
        "all" | _ => QueryTarget::All,
    }
}

/// Executes a Zenoh `get` query and collects all responses until timeout or completion.
pub async fn execute_query(
    session: &zenoh::Session,
    session_id: Uuid,
    selector: &str,
    target: &str,
    timeout_ms: u64,
) -> Result<Vec<ReplySample>, String> {
    let start_time = Instant::now();
    let query_target = parse_query_target(target);
    let timeout = Duration::from_millis(timeout_ms.max(100));

    let receiver = session
        .get(selector)
        .target(query_target)
        .timeout(timeout)
        .await
        .map_err(|e| format!("failed to execute get query on '{selector}': {e}"))?;

    let mut replies = Vec::new();
    while let Ok(reply) = receiver.recv_async().await {
        let latency_ms = start_time.elapsed().as_millis() as u64;
        let now = chrono::Utc::now().timestamp_millis();

        let replier_id: Option<String> = None;

        match reply.result() {
            Ok(sample) => {
                let key_expr = sample.key_expr().to_string();
                let payload = sample.payload().to_bytes().to_vec();
                let encoding = sample.encoding().to_string();

                replies.push(ReplySample {
                    session_id,
                    key_expr,
                    payload,
                    encoding,
                    replier_id,
                    latency_ms,
                    timestamp: now,
                    is_err: false,
                    error_message: None,
                });
            }
            Err(err_value) => {
                let key_expr = selector.to_string();
                let payload = err_value.payload().to_bytes().to_vec();
                let encoding = err_value.encoding().to_string();
                let error_message = String::from_utf8(payload.clone())
                    .ok()
                    .or_else(|| Some(format!("{:?}", err_value)));

                replies.push(ReplySample {
                    session_id,
                    key_expr,
                    payload,
                    encoding,
                    replier_id,
                    latency_ms,
                    timestamp: now,
                    is_err: true,
                    error_message,
                });
            }
        }
    }

    Ok(replies)
}

/// Declares a Zenoh queryable and spawns a background handler task.
pub async fn declare_queryable_with_handler<F, Fut>(
    session: &zenoh::Session,
    session_id: Uuid,
    queryable_id: Uuid,
    key_expr: &str,
    handler: F,
) -> Result<ActiveQueryable, String>
where
    F: Fn(QueryHandle) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let queryable = session
        .declare_queryable(key_expr)
        .await
        .map_err(|e| format!("failed to declare queryable for '{key_expr}': {e}"))?;

    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    let handler_arc = Arc::new(handler);
    let key_expr_str = key_expr.to_string();

    let task_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let _ = queryable.undeclare().await;
                    break;
                }
                query_res = queryable.recv_async() => {
                    match query_res {
                        Ok(query) => {
                            let token = Uuid::new_v4();
                            let (handle, _) = QueryHandle::new(token, session_id, queryable_id, query);
                            let h = handler_arc.clone();
                            tokio::spawn(async move {
                                (h)(handle).await;
                            });
                        }
                        Err(_) => {
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(ActiveQueryable {
        queryable_id,
        key_expr: key_expr_str,
        stop_tx: Some(stop_tx),
        task_handle,
    })
}
