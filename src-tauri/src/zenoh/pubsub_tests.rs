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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_qos_and_options() {
        use crate::zenoh::types::{PublishOptions, SubscribeOptions};

        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx, mut rx) = mpsc::channel(10);
        let sub_id = Uuid::new_v4();

        manager
            .subscribe_with_options(
                &session_id,
                sub_id,
                "robot/telemetry/imu",
                Some(SubscribeOptions {
                    allowed_origin: Some("any".to_string()),
                }),
                move |sample| {
                    let _ = tx.try_send(sample);
                },
            )
            .await
            .unwrap();

        manager
            .publish_with_options(
                &session_id,
                "robot/telemetry/imu",
                b"{\"accel\": [0.0, 9.81, 0.0]}".to_vec(),
                "json",
                "put",
                Some(PublishOptions {
                    priority: Some("realtime".to_string()),
                    congestion_control: Some("drop".to_string()),
                    express: Some(true),
                    attachment: Some(b"source:imu_sensor_1".to_vec()),
                }),
            )
            .await
            .unwrap();

        let received = tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .expect("timeout waiting for qos sample")
            .expect("channel closed");

        assert_eq!(received.key_expr, "robot/telemetry/imu");
        assert_eq!(received.payload, b"{\"accel\": [0.0, 9.81, 0.0]}");
        assert_eq!(received.attachment, Some(b"source:imu_sensor_1".to_vec()));

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_stream_generator_burst_and_continuous() {
        use crate::zenoh::types::StreamGeneratorConfig;

        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx, mut rx) = mpsc::channel(100);
        let sub_id = Uuid::new_v4();

        manager
            .subscribe(&session_id, sub_id, "stream/counter", move |sample| {
                let _ = tx.try_send(sample);
            })
            .await
            .unwrap();

        let gen_id = Uuid::new_v4();
        let gen_config = StreamGeneratorConfig {
            session_id,
            generator_id: gen_id,
            key_expr: "stream/counter".to_string(),
            encoding: "json".to_string(),
            rate_hz: 50,
            payload_template: "{\"seq\": {{counter}}, \"val\": {{sin}}}".to_string(),
            priority: Some("data_high".to_string()),
            congestion_control: Some("drop".to_string()),
            total_count: Some(5), // Burst of 5
        };

        manager.start_stream_generator(gen_config).await.unwrap();

        let mut received_count = 0;
        for _ in 0..5 {
            if let Ok(Some(sample)) = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await {
                assert_eq!(sample.key_expr, "stream/counter");
                received_count += 1;
            }
        }

        assert_eq!(received_count, 5);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_receives_untimestamped_messages() {
        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx, mut rx) = mpsc::channel(10);
        let sub_id = Uuid::new_v4();

        manager
            .subscribe(&session_id, sub_id, "untimestamped/test", move |sample| {
                let _ = tx.try_send(sample);
            })
            .await
            .unwrap();

        // Directly publish through native zenoh::Session without adding .timestamp()
        let raw_session = manager.get_session(&session_id).await.unwrap();
        raw_session
            .put("untimestamped/test", "raw message without hlc")
            .await
            .unwrap();

        let received = tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .expect("timeout waiting for untimestamped sample")
            .expect("channel closed");

        assert_eq!(received.key_expr, "untimestamped/test");
        assert_eq!(received.payload, b"raw message without hlc");
        assert!(received.timestamp > 0);

        manager.disconnect(&session_id).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_zenoh_pubsub_multiple_subscribers_same_key_expr() {
        let manager = SessionManager::new();
        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.unwrap();

        let (tx1, mut rx1) = mpsc::channel(10);
        let (tx2, mut rx2) = mpsc::channel(10);
        let sub_id1 = Uuid::new_v4();
        let sub_id2 = Uuid::new_v4();

        // Subscribe twice to the exact same key expression with different sub_ids
        manager
            .subscribe(&session_id, sub_id1, "shared/topic", move |sample| {
                let _ = tx1.try_send(sample);
            })
            .await
            .unwrap();

        manager
            .subscribe(&session_id, sub_id2, "shared/topic", move |sample| {
                let _ = tx2.try_send(sample);
            })
            .await
            .unwrap();

        manager
            .publish(&session_id, "shared/topic", b"shared data".to_vec(), "text", "put")
            .await
            .unwrap();

        let recv1 = tokio::time::timeout(Duration::from_secs(3), rx1.recv())
            .await
            .expect("timeout waiting for sub1")
            .expect("channel 1 closed");

        let recv2 = tokio::time::timeout(Duration::from_secs(3), rx2.recv())
            .await
            .expect("timeout waiting for sub2")
            .expect("channel 2 closed");

        assert_eq!(recv1.payload, b"shared data");
        assert_eq!(recv2.payload, b"shared data");

        manager.disconnect(&session_id).await.unwrap();
    }
}
