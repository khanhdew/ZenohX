//! End-to-end integration tests for ZenohX MVP
//! Verifies SQLite profile persistence, concurrent peer sessions,
//! pub/sub message propagation, and query/reply RPC roundtrips.

use std::time::Duration;
use tokio::sync::mpsc;
use uuid::Uuid;
use zenohx_lib::db::{ConnectionProfile, Database};
use zenohx_lib::zenoh::{SessionConfig, SessionManager, ZenohSample};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_full_e2e_integration_workflow() {
    // =========================================================================
    // 1. Initialize SQLite Database & Verify Profile Persistence
    // =========================================================================
    let db = Database::new_in_memory().expect("failed to create in-memory sqlite db");
    db.init_tables().expect("failed to initialize sqlite tables");

    let profile1_id = Uuid::new_v4().to_string();
    let profile1 = ConnectionProfile {
        id: profile1_id.clone(),
        name: "Test Peer Node 1".to_string(),
        mode: "peer".to_string(),
        connect_locators: vec![],
        listen_locators: vec!["tcp/127.0.0.1:17448".to_string()],
        scout_multicast: false,
        user_auth: None,
        tls_config: None,
        custom_config: None,
        created_at: 1700000000,
        updated_at: 1700000000,
    };

    let profile2_id = Uuid::new_v4().to_string();
    let profile2 = ConnectionProfile {
        id: profile2_id.clone(),
        name: "Test Peer Node 2".to_string(),
        mode: "peer".to_string(),
        connect_locators: vec!["tcp/127.0.0.1:17448".to_string()],
        listen_locators: vec![],
        scout_multicast: false,
        user_auth: None,
        tls_config: None,
        custom_config: None,
        created_at: 1700000000,
        updated_at: 1700000000,
    };

    // Save profiles
    db.save_profile(&profile1).expect("failed to save profile 1");
    db.save_profile(&profile2).expect("failed to save profile 2");

    // Verify stored profiles
    let loaded_profiles = db.get_profiles().expect("failed to fetch profiles");
    assert_eq!(loaded_profiles.len(), 2);
    assert!(loaded_profiles.iter().any(|p| p.id == profile1_id && p.name == "Test Peer Node 1"));
    assert!(loaded_profiles.iter().any(|p| p.id == profile2_id && p.name == "Test Peer Node 2"));

    // =========================================================================
    // 2. Open 2 Concurrent Zenoh Peer Sessions in SessionManager
    // =========================================================================
    let session_manager = SessionManager::new();

    let session1_config = SessionConfig {
        profile_id: Some(profile1_id.clone()),
        mode: "peer".to_string(),
        connect_locators: vec![],
        listen_locators: vec!["tcp/127.0.0.1:17448".to_string()],
        scout_multicast: false,
        scout_gossip: false,
        reconnect_retry: None,
        user_auth: None,
        tls_config: None,
        custom_config: None,
    };

    let session2_config = SessionConfig {
        profile_id: Some(profile2_id.clone()),
        mode: "peer".to_string(),
        connect_locators: vec!["tcp/127.0.0.1:17448".to_string()],
        listen_locators: vec![],
        scout_multicast: false,
        scout_gossip: false,
        reconnect_retry: None,
        user_auth: None,
        tls_config: None,
        custom_config: None,
    };

    let session1_id = session_manager
        .connect(session1_config)
        .await
        .expect("failed to connect session 1");
    let session2_id = session_manager
        .connect(session2_config)
        .await
        .expect("failed to connect session 2");

    assert_ne!(session1_id, session2_id);
    assert!(session_manager.has_session(&session1_id).await);
    assert!(session_manager.has_session(&session2_id).await);

    let active_sessions = session_manager.get_all_sessions().await;
    assert_eq!(active_sessions.len(), 2);

    // Allow peer TCP link to establish
    tokio::time::sleep(Duration::from_millis(300)).await;

    // =========================================================================
    // 3. Pub/Sub Message Exchange: Session 1 subscribes, Session 2 publishes
    // =========================================================================
    let (sample_tx, mut sample_rx) = mpsc::channel::<ZenohSample>(10);
    let sub_id = Uuid::new_v4();

    // Session 1 subscribes to wildcard topic `zenohx/test/**`
    session_manager
        .subscribe(&session1_id, sub_id, "zenohx/test/**", move |sample| {
            let _ = sample_tx.try_send(sample);
        })
        .await
        .expect("session 1 failed to subscribe to zenohx/test/**");

    // Small delay to allow subscription announcement propagation across the peer link
    tokio::time::sleep(Duration::from_millis(300)).await;

    // Session 2 publishes JSON sample to `zenohx/test/sensor1`
    let sample_payload = br#"{"status": "active", "value": 42}"#.to_vec();
    session_manager
        .publish(
            &session2_id,
            "zenohx/test/sensor1",
            sample_payload.clone(),
            "application/json",
            "put",
        )
        .await
        .expect("session 2 failed to publish sample");

    // Session 1 receives the sample
    let received_sample = tokio::time::timeout(Duration::from_secs(4), sample_rx.recv())
        .await
        .expect("timed out waiting for sample on session 1")
        .expect("sample channel closed unexpectedly");

    assert_eq!(received_sample.key_expr, "zenohx/test/sensor1");
    assert_eq!(received_sample.payload, sample_payload);
    assert_eq!(received_sample.kind, "put");

    // =========================================================================
    // 4. Query / RPC Exchange: Session 1 declares queryable, Session 2 queries
    // =========================================================================
    let queryable_id = Uuid::new_v4();
    let rpc_key_expr = "zenohx/rpc/calc";

    // Session 1 declares a queryable endpoint on `zenohx/rpc/calc`
    session_manager
        .declare_queryable(&session1_id, queryable_id, rpc_key_expr, |query_handle| {
            async move {
                let params = query_handle.parameters.clone();
                let reply_payload = if params.contains("op=add") {
                    br#"{"result": 100, "status": "calculated"}"#.to_vec()
                } else {
                    br#"{"status": "ok", "version": "0.1.0"}"#.to_vec()
                };

                let _ = query_handle
                    .reply_with_encoding("zenohx/rpc/calc", reply_payload, "application/json")
                    .await;
            }
        })
        .await
        .expect("session 1 failed to declare queryable on zenohx/rpc/calc");

    // Small delay to allow queryable route propagation
    tokio::time::sleep(Duration::from_millis(300)).await;

    // Session 2 queries `zenohx/rpc/calc?op=add`
    let replies = session_manager
        .query_get(
            &session2_id,
            "zenohx/rpc/calc?op=add",
            "all",
            4000,
        )
        .await
        .expect("session 2 failed to execute query");

    assert!(!replies.is_empty(), "expected at least 1 reply from queryable");
    assert_eq!(replies[0].key_expr, "zenohx/rpc/calc");
    assert_eq!(
        replies[0].payload,
        br#"{"result": 100, "status": "calculated"}"#.to_vec()
    );
    assert_eq!(replies[0].encoding, "application/json");
    assert!(!replies[0].is_err);

    // =========================================================================
    // 5. Clean Teardown & Disconnection
    // =========================================================================
    session_manager
        .disconnect(&session1_id)
        .await
        .expect("failed to disconnect session 1");
    assert!(!session_manager.has_session(&session1_id).await);

    session_manager
        .disconnect(&session2_id)
        .await
        .expect("failed to disconnect session 2");
    assert!(!session_manager.has_session(&session2_id).await);

    let remaining_sessions = session_manager.get_all_sessions().await;
    assert_eq!(remaining_sessions.len(), 0);
}
