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
}
