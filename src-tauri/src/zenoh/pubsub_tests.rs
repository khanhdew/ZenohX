#[cfg(test)]
mod tests {
    use super::super::manager::*;
    use super::super::types::*;
    use tokio::sync::mpsc;
    use std::time::Duration;
    use uuid::Uuid;

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_loopback() {
        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx, mut rx) = mpsc::channel(10);
        let sub_id = Uuid::new_v4();

        manager
            .subscribe(&session_id, sub_id, "demo/test/topic", move |sample| {
                let _ = tx.try_send(sample);
            })
            .await
            .unwrap();

        manager
            .publish(
                &session_id,
                "demo/test/topic",
                b"hello zenoh".to_vec(),
                "text",
                "put",
            )
            .await
            .unwrap();

        let received = tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .expect("timeout waiting for sample")
            .expect("channel closed");

        assert_eq!(received.key_expr, "demo/test/topic");
        assert_eq!(received.payload, b"hello zenoh");
        assert_eq!(received.kind, "put");

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_delete_kind() {
        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx, mut rx) = mpsc::channel(10);
        let sub_id = Uuid::new_v4();

        manager
            .subscribe(&session_id, sub_id, "demo/test/delete", move |sample| {
                let _ = tx.try_send(sample);
            })
            .await
            .unwrap();

        manager
            .publish(
                &session_id,
                "demo/test/delete",
                vec![],
                "raw",
                "delete",
            )
            .await
            .unwrap();

        let received = tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .expect("timeout waiting for delete sample")
            .expect("channel closed");

        assert_eq!(received.key_expr, "demo/test/delete");
        assert_eq!(received.kind, "delete");

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_unsubscribe() {
        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx, mut rx) = mpsc::channel(10);
        let sub_id = Uuid::new_v4();

        manager
            .subscribe(&session_id, sub_id, "demo/test/unsub", move |sample| {
                let _ = tx.try_send(sample);
            })
            .await
            .unwrap();

        manager
            .publish(
                &session_id,
                "demo/test/unsub",
                b"first message".to_vec(),
                "text",
                "put",
            )
            .await
            .unwrap();

        let first = tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .expect("timeout waiting for first sample")
            .expect("channel closed");
        assert_eq!(first.payload, b"first message");

        // Unsubscribe
        manager.unsubscribe(&session_id, sub_id).await.unwrap();

        // Publish second message
        manager
            .publish(
                &session_id,
                "demo/test/unsub",
                b"second message".to_vec(),
                "text",
                "put",
            )
            .await
            .unwrap();

        // Expect no sample within 500ms
        let result = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await;
        if let Ok(Some(sample)) = result {
            panic!("should not receive sample after unsubscribe, but got: {:?}", sample);
        }

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_wildcard_matching() {
        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx, mut rx) = mpsc::channel(10);
        let sub_id = Uuid::new_v4();

        manager
            .subscribe(&session_id, sub_id, "sensor/**", move |sample| {
                let _ = tx.try_send(sample);
            })
            .await
            .unwrap();

        manager
            .publish(
                &session_id,
                "sensor/temperature/living_room",
                b"{\"temp\": 23.5}".to_vec(),
                "json",
                "put",
            )
            .await
            .unwrap();

        let received = tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .expect("timeout waiting for wildcard sample")
            .expect("channel closed");

        assert_eq!(received.key_expr, "sensor/temperature/living_room");
        assert_eq!(received.payload, b"{\"temp\": 23.5}");

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_invalid_session() {
        let manager = SessionManager::new();
        let invalid_session_id = Uuid::new_v4();
        let sub_id = Uuid::new_v4();

        let sub_res = manager
            .subscribe(&invalid_session_id, sub_id, "demo/topic", |_| {})
            .await;
        assert!(sub_res.is_err());

        let pub_res = manager
            .publish(&invalid_session_id, "demo/topic", vec![], "text", "put")
            .await;
        assert!(pub_res.is_err());

        let unsub_res = manager.unsubscribe(&invalid_session_id, sub_id).await;
        assert!(unsub_res.is_err());
    }
}
