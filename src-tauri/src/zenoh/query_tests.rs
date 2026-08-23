#[cfg(test)]
mod tests {
    use super::super::manager::*;
    use super::super::types::*;
    use std::time::Duration;
    use tokio::sync::mpsc;
    use uuid::Uuid;

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_and_queryable_roundtrip() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        // Declare a mock Queryable
        manager
            .declare_queryable(&session_id, q_id, "demo/rpc/**", |query| async move {
                query
                    .reply("demo/rpc/info", b"{\"status\": \"ok\"}".to_vec())
                    .await
                    .unwrap();
            })
            .await
            .unwrap();

        // Execute Query
        let replies = manager
            .query_get(&session_id, "demo/rpc/info", "all", 2000)
            .await
            .unwrap();
        assert!(!replies.is_empty());
        assert_eq!(replies[0].payload, b"{\"status\": \"ok\"}");
        assert_eq!(replies[0].is_err, false);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_with_custom_encoding() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        manager
            .declare_queryable(&session_id, q_id, "sensor/telemetry", |query| async move {
                query
                    .reply_with_encoding(
                        "sensor/telemetry",
                        b"temperature=24.5".to_vec(),
                        "text/plain",
                    )
                    .await
                    .unwrap();
            })
            .await
            .unwrap();

        let replies = manager
            .query_get(&session_id, "sensor/telemetry", "best_matching", 2000)
            .await
            .unwrap();

        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0].key_expr, "sensor/telemetry");
        assert_eq!(replies[0].payload, b"temperature=24.5");
        assert_eq!(replies[0].encoding, "text/plain");
        assert!(!replies[0].is_err);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_error_reply() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        manager
            .declare_queryable(&session_id, q_id, "service/error_test", |query| async move {
                query.reply_err("internal service failure").await.unwrap();
            })
            .await
            .unwrap();

        let replies = manager
            .query_get(&session_id, "service/error_test", "all", 2000)
            .await
            .unwrap();

        assert_eq!(replies.len(), 1);
        assert!(replies[0].is_err);
        assert!(
            replies[0]
                .error_message
                .as_ref()
                .unwrap()
                .contains("internal service failure")
        );

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_delete_reply() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        manager
            .declare_queryable(&session_id, q_id, "cache/item", |query| async move {
                query.reply_del("cache/item").await.unwrap();
            })
            .await
            .unwrap();

        let replies = manager
            .query_get(&session_id, "cache/item", "all", 2000)
            .await
            .unwrap();

        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0].key_expr, "cache/item");
        assert!(!replies[0].is_err);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_undeclare_queryable() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        manager
            .declare_queryable(&session_id, q_id, "service/unreg", |query| async move {
                query.reply("service/unreg", b"active".to_vec()).await.unwrap();
            })
            .await
            .unwrap();

        let replies = manager
            .query_get(&session_id, "service/unreg", "all", 1000)
            .await
            .unwrap();
        assert_eq!(replies.len(), 1);

        // Undeclare queryable
        manager.undeclare_queryable(&session_id, q_id).await.unwrap();

        // Second query should receive 0 replies
        let replies_after = manager
            .query_get(&session_id, "service/unreg", "all", 300)
            .await
            .unwrap();
        assert_eq!(replies_after.len(), 0);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_routed_and_reply_token() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        let (tx, mut rx) = mpsc::channel::<InboundQuery>(10);

        // Declare routed queryable (emulating Tauri IPC event emission)
        manager
            .declare_queryable_routed(&session_id, q_id, "ipc/rpc/**", move |inbound| {
                let _ = tx.try_send(inbound);
            })
            .await
            .unwrap();

        // Spawn a background querier task
        let mgr_clone = manager.clone();
        let query_handle = tokio::spawn(async move {
            mgr_clone
                .query_get(&session_id, "ipc/rpc/calculate?x=10&y=20", "all", 3000)
                .await
        });

        // Wait for inbound query notification
        let inbound = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timeout waiting for inbound query")
            .expect("channel closed");

        assert_eq!(inbound.key_expr, "ipc/rpc/calculate");
        assert_eq!(inbound.parameters, "x=10&y=20");

        // Reply using the token via SessionManager
        manager
            .reply_query(
                &inbound.token,
                "ipc/rpc/calculate",
                b"{\"result\": 30}".to_vec(),
                "application/json",
            )
            .await
            .unwrap();

        // Collect query result
        let replies = query_handle.await.unwrap().unwrap();
        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0].payload, b"{\"result\": 30}");
        assert_eq!(replies[0].encoding, "application/json");
        assert!(!replies[0].is_err);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_reply_on_wildcard_key_expr_sanitizes() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        let (tx, mut rx) = mpsc::channel::<InboundQuery>(10);

        // Declare routed queryable on wildcard expression
        manager
            .declare_queryable_routed(&session_id, q_id, "wildcard/rpc/**", move |inbound| {
                let _ = tx.try_send(inbound);
            })
            .await
            .unwrap();

        // Querier sends query on wildcard selector
        let mgr_clone = manager.clone();
        let query_handle = tokio::spawn(async move {
            mgr_clone
                .query_get(&session_id, "wildcard/rpc/**", "all", 3000)
                .await
        });

        let inbound = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timeout")
            .expect("channel closed");

        // Replying with the inbound wildcard key_expr (e.g. "wildcard/rpc/**") should succeed because it auto-sanitizes
        manager
            .reply_query(
                &inbound.token,
                &inbound.key_expr,
                b"{\"wildcard_reply\": true}".to_vec(),
                "application/json",
            )
            .await
            .unwrap();

        let replies = query_handle.await.unwrap().unwrap();
        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0].key_expr, "wildcard/rpc");
        assert_eq!(replies[0].payload, b"{\"wildcard_reply\": true}");
        assert!(!replies[0].is_err);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_multiple_queryables_scatter_gather() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();

        let (tx, mut rx) = mpsc::channel::<InboundQuery>(10);

        // Declare 3 queryables on different subpaths
        let keys = ["demo/service/node1", "demo/service/node2", "demo/service/node3"];
        for key in &keys {
            let tx_clone = tx.clone();
            manager
                .declare_queryable_routed(&session_id, Uuid::new_v4(), key, move |inbound| {
                    let _ = tx_clone.try_send(inbound);
                })
                .await
                .unwrap();
        }

        // Query with wildcard selector
        let mgr_clone = manager.clone();
        let query_handle = tokio::spawn(async move {
            mgr_clone
                .query_get(&session_id, "demo/service/**", "all", 3000)
                .await
        });

        // Collect and reply to all 3 incoming queries
        for _ in 0..3 {
            let inbound = tokio::time::timeout(Duration::from_secs(2), rx.recv())
                .await
                .expect("timeout waiting for query")
                .expect("channel closed");

            let reply_payload = format!("{{\"node\":\"{}\"}}", inbound.key_expr).into_bytes();
            manager
                .reply_query(
                    &inbound.token,
                    &inbound.key_expr,
                    reply_payload,
                    "application/json",
                )
                .await
                .unwrap();
        }

        let replies = query_handle.await.unwrap().unwrap();
        assert_eq!(replies.len(), 3, "Expected 3 replies from 3 distinct queryables");

        let reply_keys: Vec<String> = replies.iter().map(|r| r.key_expr.clone()).collect();
        assert!(reply_keys.contains(&"demo/service/node1".to_string()));
        assert!(reply_keys.contains(&"demo/service/node2".to_string()));
        assert!(reply_keys.contains(&"demo/service/node3".to_string()));

        manager.disconnect(&session_id).await.unwrap();
    }



    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_invalid_session_and_tokens() {
        let manager = SessionManager::new();
        let invalid_session_id = Uuid::new_v4();
        let q_id = Uuid::new_v4();

        // Query on invalid session
        let query_res = manager
            .query_get(&invalid_session_id, "test/topic", "all", 500)
            .await;
        assert!(query_res.is_err());

        // Declare queryable on invalid session
        let decl_res = manager
            .declare_queryable(&invalid_session_id, q_id, "test/topic", |_| async {})
            .await;
        assert!(decl_res.is_err());

        // Undeclare queryable on invalid session
        let undecl_res = manager
            .undeclare_queryable(&invalid_session_id, q_id)
            .await;
        assert!(undecl_res.is_err());

        // Reply with unknown token
        let unknown_token = Uuid::new_v4();
        let reply_res = manager
            .reply_query(&unknown_token, "test/topic", vec![], "application/json")
            .await;
        assert!(reply_res.is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_undeclare_queryable_prunes_pending_queries() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        let (tx, mut rx) = mpsc::channel::<InboundQuery>(10);

        manager
            .declare_queryable_routed(&session_id, q_id, "prune/test/**", move |inbound| {
                let _ = tx.try_send(inbound);
            })
            .await
            .unwrap();

        let mgr_clone = manager.clone();
        tokio::spawn(async move {
            let _ = mgr_clone
                .query_get(&session_id, "prune/test/req", "all", 1000)
                .await;
        });

        let inbound = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timeout waiting for inbound query")
            .expect("channel closed");

        // Undeclare the queryable before replying
        manager.undeclare_queryable(&session_id, q_id).await.unwrap();

        // Replying with the token should now fail because pending queries were pruned
        let reply_res = manager
            .reply_query(
                &inbound.token,
                "prune/test/req",
                b"ok".to_vec(),
                "text/plain",
            )
            .await;
        assert!(reply_res.is_err());

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_query_with_request_payload_and_consolidation() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();
        let q_id = Uuid::new_v4();

        // Declare a queryable that inspects query payload and parameters
        manager
            .declare_queryable(&session_id, q_id, "rpc/service/compute", |query| async move {
                let p = query.payload.as_deref().unwrap_or(b"");
                let response = format!("processed: {}", String::from_utf8_lossy(p));
                query
                    .reply("rpc/service/compute", response.into_bytes())
                    .await
                    .unwrap();
            })
            .await
            .unwrap();

        // Execute query with payload, custom encoding, and consolidation
        let request_payload = b"input_data_123".to_vec();
        let replies = manager
            .query_get_advanced(
                &session_id,
                "rpc/service/compute",
                "best_matching",
                2000,
                Some(request_payload),
                Some("text/plain".to_string()),
                Some("latest".to_string()),
            )
            .await

            .unwrap();

        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0].payload, b"processed: input_data_123");
        assert!(!replies[0].is_err);

        manager.disconnect(&session_id).await.unwrap();
    }
}

