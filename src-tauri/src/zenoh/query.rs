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

use super::pubsub::parse_encoding;
use super::types::{InboundQuery, ReplySample};
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::oneshot;
use uuid::Uuid;
use zenoh::query::{Query, QueryConsolidation, QueryTarget};

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
    pub queryable_key_expr: String,
    pub key_expr: String,
    pub parameters: String,
    pub payload: Option<Vec<u8>>,
    pub encoding: Option<String>,
    pub timestamp: i64,
    query: Arc<parking_lot::Mutex<Option<Query>>>,
}

/// Sanitizes a key expression for query reply by stripping query parameters and wildcards if present,
/// ensuring Zenoh receives a valid non-wildcard concrete key expression.
pub fn sanitize_reply_key_expr(key_expr: &str, fallback_key: &str) -> String {
    let base = key_expr.split('?').next().unwrap_or(key_expr).trim();
    if !base.contains('*') && !base.contains('$') && !base.is_empty() {
        return base.to_string();
    }

    let fallback_base = fallback_key.split('?').next().unwrap_or(fallback_key).trim();
    if !fallback_base.contains('*') && !fallback_base.contains('$') && !fallback_base.is_empty() {
        return fallback_base.to_string();
    }

    let mut clean = fallback_base
        .replace("/**", "")
        .replace("/*", "")
        .replace('*', "");
    while clean.ends_with('/') {
        clean.pop();
    }

    if !clean.is_empty() {
        clean
    } else {
        "reply".to_string()
    }
}

impl QueryHandle {
    /// Creates a new `QueryHandle` and its corresponding `InboundQuery` data transfer object.
    pub fn new(
        token: Uuid,
        session_id: Uuid,
        queryable_id: Uuid,
        queryable_key_expr: String,
        query: Query,
    ) -> (Self, InboundQuery) {
        let key_expr = query.key_expr().to_string();
        let parameters = query.parameters().to_string();
        let payload = query.payload().map(|p| p.to_bytes().to_vec());
        let encoding = query.encoding().map(|e| e.to_string());
        let timestamp = chrono::Utc::now().timestamp_millis();

        // InboundQuery key_expr uses the concrete queryable_key_expr so frontend can reply accurately
        let inbound = InboundQuery {
            token,
            session_id,
            queryable_id,
            key_expr: queryable_key_expr.clone(),
            parameters: parameters.clone(),
            payload: payload.clone(),
            encoding: encoding.clone(),
            timestamp,
        };

        let handle = Self {
            token,
            session_id,
            queryable_id,
            queryable_key_expr,
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
            let clean_key = sanitize_reply_key_expr(key_expr, &self.queryable_key_expr);
            query
                .reply(&clean_key, payload)
                .encoding(enc)
                .await
                .map_err(|e| format!("failed to send query reply on '{clean_key}': {e}"))?;
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
            let clean_key = sanitize_reply_key_expr(key_expr, &self.queryable_key_expr);
            query
                .reply_del(&clean_key)
                .await
                .map_err(|e| format!("failed to send query delete reply on '{clean_key}': {e}"))?;
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

/// Parses consolidation mode string into a Zenoh `QueryConsolidation`.
pub fn parse_query_consolidation(consolidation: Option<&str>) -> QueryConsolidation {
    match consolidation.map(|s| s.to_lowercase().trim().to_string()).as_deref() {
        Some("none") => QueryConsolidation::from(zenoh::query::ConsolidationMode::None),
        Some("latest") => QueryConsolidation::from(zenoh::query::ConsolidationMode::Latest),
        Some("monotonic") => QueryConsolidation::from(zenoh::query::ConsolidationMode::Monotonic),
        _ => QueryConsolidation::AUTO,
    }
}


/// Executes a Zenoh `get` query and collects all responses until timeout or completion.
pub async fn execute_query(
    session: &zenoh::Session,
    session_id: Uuid,
    selector: &str,
    target: &str,
    timeout_ms: u64,
    payload: Option<Vec<u8>>,
    encoding: Option<String>,
    consolidation: Option<String>,
) -> Result<Vec<ReplySample>, String> {
    let start_time = Instant::now();
    let query_target = parse_query_target(target);
    let query_consolidation = parse_query_consolidation(consolidation.as_deref());
    let timeout = Duration::from_millis(timeout_ms.max(100));

    let mut get_builder = session
        .get(selector)
        .target(query_target)
        .consolidation(query_consolidation)
        .timeout(timeout);

    if let Some(p) = payload {
        get_builder = get_builder.payload(p);
    }

    if let Some(enc_str) = encoding {
        let enc = parse_encoding(&enc_str);
        get_builder = get_builder.encoding(enc);
    }

    let receiver = get_builder
        .await
        .map_err(|e| format!("failed to execute get query on '{selector}': {e}"))?;


    let mut replies = Vec::new();
    while let Ok(reply) = receiver.recv_async().await {
        let latency_ms = start_time.elapsed().as_millis() as u64;
        let now = chrono::Utc::now().timestamp_millis();
        let replier_id: Option<String> = reply.replier_id().map(|z| z.zid().to_string());

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
    let task_key_expr = key_expr.to_string();

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
                            let (handle, _) = QueryHandle::new(
                                token,
                                session_id,
                                queryable_id,
                                task_key_expr.clone(),
                                query,
                            );
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
