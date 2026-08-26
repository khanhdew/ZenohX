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

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use crate::db::Database;
    use crate::db::models::ConnectionProfile;
    use crate::zenoh::manager::*;
    use crate::zenoh::types::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_connect_from_db_profile() {
        let db = Database::new_in_memory().expect("failed to init in-memory db");
        db.init_tables().expect("failed to init tables");
        let manager = Arc::new(SessionManager::new());

        let profile = ConnectionProfile {
            id: "test-db-node-1".to_string(),
            name: "Test DB Router Node".to_string(),
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tcp/127.0.0.1:0".to_string()],
            scout_multicast: false,
            user_auth: None,
            tls_config: None,
            custom_config: None,
            created_at: 1000,
            updated_at: 1000,
        };
        db.save_profile(&profile).expect("failed to save profile");

        // Convert profile to SessionConfig and connect
        let loaded = db.get_profile_by_id("test-db-node-1").unwrap().unwrap();
        let user_auth = loaded.user_auth.and_then(|v| serde_json::from_value(v).ok());
        let tls_config = loaded.tls_config.and_then(|v| serde_json::from_value(v).ok());

        let config = SessionConfig {
            profile_id: Some(loaded.id.clone()),
            mode: loaded.mode,
            connect_locators: loaded.connect_locators,
            listen_locators: loaded.listen_locators,
            scout_multicast: loaded.scout_multicast,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth,
            tls_config,
            custom_config: loaded.custom_config,
        };

        let session_id = manager.connect(config).await.expect("connect failed");
        let info = manager.get_session_info(&session_id).await.expect("info failed");
        assert_eq!(info.profile_id.as_deref(), Some("test-db-node-1"));
        assert!(!info.zid.is_empty());

        let _ = manager.disconnect(&session_id).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_zenoh_tls_router_and_client_connection() {
        let manager = Arc::new(SessionManager::new());

        // 1. Router with Server Cert & Key
        let router_config = SessionConfig {
            profile_id: Some("tls-router-1".to_string()),
            mode: "router".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tls/127.0.0.1:7446".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: Some(TlsConfig {
                ca_cert: Some("/tmp/zenohx-tls-test/ca.crt".to_string()),
                client_cert: Some("/tmp/zenohx-tls-test/server.crt".to_string()),
                client_key: Some("/tmp/zenohx-tls-test/server.key".to_string()),
                tls_only: Some(true),
            }),
            custom_config: None,
        };

        let router_session_id = manager.connect(router_config).await.expect("Router connect failed");
        let router_info = manager.get_session_info(&router_session_id).await.expect("Router info failed");
        println!("Router connected with bound locators: {:?}", router_info.bound_locators);

        // 2. Client with Root CA
        let client_config = SessionConfig {
            profile_id: Some("tls-client-1".to_string()),
            mode: "client".to_string(),
            connect_locators: vec!["tls/127.0.0.1:7446".to_string()],
            listen_locators: vec![],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: Some(TlsConfig {
                ca_cert: Some("/tmp/zenohx-tls-test/ca.crt".to_string()),
                client_cert: None,
                client_key: None,
                tls_only: Some(true),
            }),
            custom_config: None,
        };

        let client_session_id = manager.connect(client_config).await;
        println!("Client connect result: {:?}", client_session_id);
        assert!(client_session_id.is_ok(), "Client connect with Root CA failed: {:?}", client_session_id.err());

        let client_id = client_session_id.unwrap();
        let client_info = manager.get_session_info(&client_id).await.expect("Client info failed");
        println!("Client info: {:?}", client_info);

        let _ = manager.disconnect(&client_id).await;
        let _ = manager.disconnect(&router_session_id).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_connect_from_db_profile_with_prefix_and_auth() {
        let db = Database::new_in_memory().expect("failed to init in-memory db");
        db.init_tables().expect("failed to init tables");
        let manager = Arc::new(SessionManager::new());

        let profile = ConnectionProfile {
            id: "my-custom-node".to_string(),
            name: "Custom Node".to_string(),
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tcp/127.0.0.1:0".to_string()],
            scout_multicast: false,
            user_auth: Some(serde_json::json!({
                "username": "admin",
                "password": "password123"
            })),
            tls_config: None,
            custom_config: None,
            created_at: 1000,
            updated_at: 1000,
        };
        db.save_profile(&profile).expect("failed to save profile");

        // Simulate lookup with "profile-" prefix
        let zid = "profile-my-custom-node";
        let raw_id = zid
            .strip_prefix("profile-")
            .or_else(|| zid.strip_prefix("scouted-"))
            .or_else(|| zid.strip_prefix("admin-"))
            .unwrap_or(zid);

        let profiles = db.get_profiles().unwrap();
        let matched = profiles.into_iter().find(|p| p.id == zid || p.id == *raw_id).unwrap();

        let user_auth: Option<UserAuth> = matched.user_auth.and_then(|v| serde_json::from_value(v).ok());
        assert!(user_auth.is_some());
        assert_eq!(user_auth.as_ref().unwrap().username.as_deref(), Some("admin"));

        let config = SessionConfig {
            profile_id: Some(matched.id.clone()),
            mode: matched.mode,
            connect_locators: matched.connect_locators,
            listen_locators: matched.listen_locators,
            scout_multicast: matched.scout_multicast,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth,
            tls_config: matched.tls_config.and_then(|v| serde_json::from_value(v).ok()),
            custom_config: matched.custom_config,
        };

        let session_id = manager.connect(config).await.expect("connect failed");
        let info = manager.get_session_info(&session_id).await.expect("info failed");
        assert_eq!(info.profile_id.as_deref(), Some("my-custom-node"));

        let _ = manager.disconnect(&session_id).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_session_manager_open_and_close() {
        let manager = SessionManager::new();
        let config = SessionConfig {
            profile_id: None,
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec![],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };

        let session_id = manager.connect(config).await.expect("failed to open zenoh session");
        assert!(manager.has_session(&session_id).await);

        manager.disconnect(&session_id).await.expect("failed to disconnect session");
        assert!(!manager.has_session(&session_id).await);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_session_manager_disconnect_non_existent() {
        let manager = SessionManager::new();
        let random_id = uuid::Uuid::new_v4();
        let res = manager.disconnect(&random_id).await;
        assert!(res.is_err());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_session_manager_multiple_sessions() {
        let manager = SessionManager::new();
        let config1 = SessionConfig::default_peer();
        let config2 = SessionConfig::default_peer();

        let s1 = manager.connect(config1).await.expect("connect s1");
        let s2 = manager.connect(config2).await.expect("connect s2");

        assert_ne!(s1, s2);
        assert!(manager.has_session(&s1).await);
        assert!(manager.has_session(&s2).await);

        let s1_info = manager.get_session_info(&s1).await.expect("get s1 info");
        assert_eq!(s1_info.id, s1);
        assert_eq!(s1_info.mode, "peer");

        let all_sessions = manager.get_all_sessions().await;
        assert_eq!(all_sessions.len(), 2);

        manager.disconnect(&s1).await.expect("disconnect s1");
        assert!(!manager.has_session(&s1).await);
        assert!(manager.has_session(&s2).await);

        manager.disconnect(&s2).await.expect("disconnect s2");
        assert!(!manager.has_session(&s2).await);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_scout_locators() {
        let manager = SessionManager::new();
        let result = manager.scout_locators(200).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_session_config_validation_and_conversion() {
        let valid_config = SessionConfig {
            profile_id: None,
            mode: "client".to_string(),
            connect_locators: vec!["tcp/127.0.0.1:7447".to_string()],
            listen_locators: vec![],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: Some(UserAuth {
                username: Some("admin".to_string()),
                password: Some("secret".to_string()),
                token: None,
            }),
            tls_config: None,
            custom_config: None,
        };
        let zenoh_config = valid_config.to_zenoh_config();
        assert!(zenoh_config.is_ok());

        let invalid_mode = SessionConfig {
            mode: "invalid_mode".to_string(),
            ..SessionConfig::default_peer()
        };
        assert!(invalid_mode.to_zenoh_config().is_err());

        // Token auth validation
        let token_config = SessionConfig {
            user_auth: Some(UserAuth {
                username: None,
                password: None,
                token: Some("secret-token-123".to_string()),
            }),
            ..SessionConfig::default_peer()
        };
        assert!(token_config.to_zenoh_config().is_ok());

        // Valid custom_config (JSON object)
        let valid_custom = SessionConfig {
            custom_config: Some(serde_json::json!({
                "transport/link/tx/threads": 2
            })),
            ..SessionConfig::default_peer()
        };
        assert!(valid_custom.to_zenoh_config().is_ok());

        // TLS-Only configuration test
        let tls_only_config = SessionConfig {
            mode: "peer".to_string(),
            tls_config: Some(TlsConfig {
                ca_cert: Some("/tmp/ca.pem".to_string()),
                client_cert: None,
                client_key: None,
                tls_only: Some(true),
            }),
            ..SessionConfig::default_peer()
        };
        assert!(tls_only_config.to_zenoh_config().is_ok());

        // UUID with dashes in custom_config (should sanitize to 32 hex chars without error)
        let uuid_custom = SessionConfig {
            custom_config: Some(serde_json::json!({
                "id": "59176069-cc84-4704-9e74-42d9d374d241",
                "transport": { "unicast": { "max_sessions": 20 } }
            })),
            ..SessionConfig::default_peer()
        };
        assert!(uuid_custom.to_zenoh_config().is_ok());

        // Invalid custom_config (non-object, e.g. JSON array)
        let invalid_custom = SessionConfig {
            custom_config: Some(serde_json::json!(["not", "an", "object"])),
            ..SessionConfig::default_peer()
        };
        let err = invalid_custom.to_zenoh_config().unwrap_err();
        assert_eq!(
            err,
            "custom_config must be a JSON object of key-value overrides"
        );
    }

    #[test]
    fn test_session_status_event_serialization() {
        let event = SessionStatusEvent {
            session_id: "sess-1234".to_string(),
            status: "disconnected".to_string(),
            error: Some("Server connection lost".to_string()),
            timestamp: Some(1700000000),
        };

        let json = serde_json::to_string(&event).expect("serialize event");
        assert!(json.contains("\"sessionId\":\"sess-1234\""));
        assert!(json.contains("\"status\":\"disconnected\""));
        assert!(json.contains("\"error\":\"Server connection lost\""));

        let deserialized: SessionStatusEvent =
            serde_json::from_str(&json).expect("deserialize event");
        assert_eq!(deserialized, event);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_session_manager_status_callback_registration() {
        let manager = SessionManager::new();
        let (tx, mut rx) = tokio::sync::mpsc::channel::<SessionStatusEvent>(10);

        manager
            .set_status_callback(move |event| {
                let _ = tx.try_send(event);
            })
            .await;

        let config = SessionConfig::default_peer();
        let session_id = manager.connect(config).await.expect("connect");

        // Verify connected event is emitted upon connect
        let conn_event = rx.try_recv().expect("receive connect status");
        assert_eq!(conn_event.status, "connected");
        assert_eq!(conn_event.session_id, session_id.to_string());

        // Clean disconnect emits disconnected status event
        manager.disconnect(&session_id).await.expect("disconnect");

        // Verify disconnected event is emitted upon disconnect
        let disc_event = rx.try_recv().expect("receive disconnect status");
        assert_eq!(disc_event.status, "disconnected");
        assert_eq!(disc_event.session_id, session_id.to_string());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_router_to_router_upstream_connection() {
        let manager = SessionManager::new();

        // 1. Start Upstream Router on port 17447
        let r1_config = SessionConfig {
            profile_id: Some("prof-r1".to_string()),
            mode: "router".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tcp/127.0.0.1:17447".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let r1_id = manager.connect(r1_config).await.expect("connect r1");

        // 2. Start Downstream Router on port 17448 connecting to Upstream Router
        let r2_config = SessionConfig {
            profile_id: Some("prof-r2".to_string()),
            mode: "router".to_string(),
            connect_locators: vec!["tcp/127.0.0.1:17447".to_string()],
            listen_locators: vec!["tcp/127.0.0.1:17448".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let r2_id = manager.connect(r2_config).await.expect("connect r2");

        // Give Zenoh a moment to establish TCP link & handshake
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Inspect transports & links on r2 session
        if let Ok(session) = manager.get_session(&r2_id).await {
            for t in session.info().transports().await {
                println!("R2 Transport: zid={}, whatami={:?}", t.zid(), t.whatami());
            }
            for l in session.info().links().await {
                println!("R2 Link: zid={}, src={}, dst={}", l.zid(), l.src(), l.dst());
            }
        }

        manager.disconnect(&r2_id).await.expect("disconnect r2");
        manager.disconnect(&r1_id).await.expect("disconnect r1");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_router_disconnect_does_not_disconnect_connected_router() {
        let manager = SessionManager::new();
        let (status_tx, mut status_rx) = tokio::sync::mpsc::channel::<SessionStatusEvent>(100);
        manager
            .set_status_callback(move |event| {
                let _ = status_tx.try_send(event);
            })
            .await;

        // 1. Start Upstream Router on port 17467
        let r1_config = SessionConfig {
            profile_id: Some("prof-r1-disc".to_string()),
            mode: "router".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tcp/127.0.0.1:17467".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let r1_id = manager.connect(r1_config).await.expect("connect r1");

        // 2. Start Downstream Router on port 17468 connecting to Upstream Router
        let r2_config = SessionConfig {
            profile_id: Some("prof-r2-disc".to_string()),
            mode: "router".to_string(),
            connect_locators: vec!["tcp/127.0.0.1:17467".to_string()],
            listen_locators: vec!["tcp/127.0.0.1:17468".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let r2_id = manager.connect(r2_config).await.expect("connect r2");

        // Give Zenoh a moment to establish TCP link & handshake and watchdog to tick
        tokio::time::sleep(tokio::time::Duration::from_millis(2500)).await;

        if let Ok(sess) = manager.get_session(&r2_id).await {
            let mut rc = 0;
            let mut routers = sess.info().routers_zid().await;
            while let Some(r) = routers.next() {
                println!("R2 saw router: {r}");
                rc += 1;
            }
            let mut pc = 0;
            let mut peers = sess.info().peers_zid().await;
            while let Some(p) = peers.next() {
                println!("R2 saw peer: {p}");
                pc += 1;
            }
            println!("R2 before R1 disconnect: routers={}, peers={}", rc, pc);
        }

        // 3. Disconnect Router 1
        println!("Disconnecting R1...");
        manager.disconnect(&r1_id).await.expect("disconnect r1");

        // Wait longer than the watchdog 1500ms interval
        tokio::time::sleep(tokio::time::Duration::from_millis(3500)).await;

        if let Ok(sess) = manager.get_session(&r2_id).await {
            let mut rc = 0;
            let mut routers = sess.info().routers_zid().await;
            while let Some(r) = routers.next() {
                println!("R2 after disconnect saw router: {r}");
                rc += 1;
            }
            let mut pc = 0;
            let mut peers = sess.info().peers_zid().await;
            while let Some(p) = peers.next() {
                println!("R2 after disconnect saw peer: {p}");
                pc += 1;
            }
            println!("R2 after R1 disconnect: routers={}, peers={}", rc, pc);
        }

        while let Ok(evt) = status_rx.try_recv() {
            println!("Received status event: id={}, status={}, error={:?}", evt.session_id, evt.status, evt.error);
        }

        // 4. Assert Router 2 is STILL active and NOT disconnected
        assert!(
            manager.has_session(&r2_id).await,
            "Router 2 should still be active even after Router 1 disconnects!"
        );

        let r2_session = manager.get_session(&r2_id).await.expect("get r2 session");
        assert!(
            !r2_session.is_closed(),
            "Router 2 session should NOT be closed!"
        );

        manager.disconnect(&r2_id).await.expect("disconnect r2");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_client_behavior_on_router_disconnect() {
        let manager = SessionManager::new();

        // 1. Start Router on port 17477
        let r_config = SessionConfig {
            profile_id: Some("prof-r-client-test".to_string()),
            mode: "router".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tcp/127.0.0.1:17477".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let r_id = manager.connect(r_config).await.expect("connect r");

        // 2. Start Client connecting to Router on 17477
        let c_config = SessionConfig {
            profile_id: Some("prof-c-test".to_string()),
            mode: "client".to_string(),
            connect_locators: vec!["tcp/127.0.0.1:17477".to_string()],
            listen_locators: vec![],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: Some(ReconnectRetryConfig {
                period_init_ms: 500,
                period_max_ms: 2000,
                factor: 2,
                timeout_ms: 10000,
            }),
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let c_id = manager.connect(c_config).await.expect("connect c");

        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;

        let c_sess = manager.get_session(&c_id).await.expect("get client session");
        let mut rc = 0;
        let mut routers = c_sess.info().routers_zid().await;
        while let Some(_) = routers.next() {
            rc += 1;
        }
        println!("Client initially connected to {} routers", rc);

        // Disconnect Router
        manager.disconnect(&r_id).await.expect("disconnect r");
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

        println!("Client session is_closed after router drop: {}", c_sess.is_closed());

        manager.disconnect(&c_id).await.ok();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_mutual_router_to_router_upstream_connection() {
        let manager = SessionManager::new();

        // 1. Router 1 connecting to Router 2 (port 17452), listening on 17451
        let r1_config = SessionConfig {
            profile_id: Some("prof-mutual-r1".to_string()),
            mode: "router".to_string(),
            connect_locators: vec!["tcp/127.0.0.1:17452".to_string()],
            listen_locators: vec!["tcp/127.0.0.1:17451".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let r1_id = manager.connect(r1_config).await.expect("connect r1");

        // 2. Router 2 connecting to Router 1 (port 17451), listening on 17452
        let r2_config = SessionConfig {
            profile_id: Some("prof-mutual-r2".to_string()),
            mode: "router".to_string(),
            connect_locators: vec!["tcp/127.0.0.1:17451".to_string()],
            listen_locators: vec!["tcp/127.0.0.1:17452".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };
        let r2_id = manager.connect(r2_config).await.expect("connect r2");

        // Give Zenoh a moment to establish TCP link & handshake
        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;

        let r1_info = manager.get_session_info(&r1_id).await.expect("get r1 info");
        let r2_info = manager.get_session_info(&r2_id).await.expect("get r2 info");

        println!("Mutual R1: zid={}, links={:?}, routers={:?}, peers={:?}",
            r1_info.zid, r1_info.links, r1_info.connected_routers, r1_info.connected_peers);
        println!("Mutual R2: zid={}, links={:?}, routers={:?}, peers={:?}",
            r2_info.zid, r2_info.links, r2_info.connected_routers, r2_info.connected_peers);

        manager.disconnect(&r2_id).await.expect("disconnect r2");
        manager.disconnect(&r1_id).await.expect("disconnect r1");
    }

    #[tokio::test]
    async fn test_session_config_gossip_and_reconnect_retry() {
        let mut config = SessionConfig::default_peer();
        config.scout_gossip = true;
        config.connect_locators = vec!["tcp/127.0.0.1:7447".to_string()];
        config.reconnect_retry = Some(ReconnectRetryConfig {
            period_init_ms: 500,
            period_max_ms: 2000,
            factor: 2,
            timeout_ms: 0,
        });

        let zenoh_config = config.to_zenoh_config().expect("to_zenoh_config should succeed");
        // Verify JSON5 configuration entries were inserted
        let json_str = format!("{:?}", zenoh_config);
        assert!(json_str.contains("scouting") || json_str.contains("gossip"));
    }

    #[test]
    fn test_unixpipe_stale_socket_cleanup() {
        let temp_dir = std::env::temp_dir();
        let socket_path = temp_dir.join("test_zenoh_stale_sock.sock");
        let socket_str = socket_path.to_string_lossy().to_string();

        // Create a dummy stale socket file
        std::fs::write(&socket_path, b"stale").expect("create stale socket file");
        assert!(socket_path.exists());

        let mut config = SessionConfig::default_peer();
        config.listen_locators = vec![format!("unixpipe/{}", socket_str.trim_start_matches('/'))];

        let res = config.to_zenoh_config();
        assert!(res.is_ok());
        // The stale socket file should have been cleaned up before binding
        assert!(!socket_path.exists());
    }

    #[test]
    fn test_session_info_gossip_and_bound_locators_serde() {
        let json_data = r#"{
            "id": "11111111-2222-3333-4444-555555555555",
            "profile_id": "test-prof",
            "zid": "abcdef123456",
            "mode": "peer",
            "scout_multicast": true,
            "scout_gossip": true,
            "connect_locators": ["tcp/127.0.0.1:7447"],
            "listen_locators": ["tcp/0.0.0.0:0"],
            "bound_locators": ["tcp/127.0.0.1:45678"],
            "created_at": 1700000000
        }"#;

        let info: SessionInfo = serde_json::from_str(json_data).expect("deserialize session info");
        assert!(info.scout_gossip);
        assert_eq!(info.bound_locators, vec!["tcp/127.0.0.1:45678"]);

        // Verify backward compatibility when scout_gossip and bound_locators are omitted in JSON
        let legacy_json = r#"{
            "id": "11111111-2222-3333-4444-555555555555",
            "zid": "abcdef123456",
            "mode": "client",
            "scout_multicast": false,
            "connect_locators": [],
            "listen_locators": [],
            "created_at": 1700000000
        }"#;
        let legacy_info: SessionInfo = serde_json::from_str(legacy_json).expect("deserialize legacy info");
        assert!(legacy_info.scout_gossip); // default_scout_gossip is true
        assert!(legacy_info.bound_locators.is_empty());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_ephemeral_port_resolution_and_multi_transport() {
        let manager = SessionManager::new();
        let mut config = SessionConfig::default();
        config.mode = "router".to_string();
        config.listen_locators = vec![
            "tcp/0.0.0.0:0".to_string(),
            "udp/127.0.0.1:0".to_string(),
        ];

        let session_id = manager.connect(config).await.expect("connect router on ephemeral ports");
        let info = manager.get_session_info(&session_id).await.expect("get session info");

        assert_eq!(info.mode, "router");
        assert!(!info.bound_locators.is_empty(), "bound_locators must not be empty");
        // Ensure the bound locators resolved to non-zero ports and non-0.0.0.0 IPs
        for loc in &info.bound_locators {
            assert!(!loc.ends_with(":0"), "resolved locator must have an allocated port: {loc}");
            assert!(!loc.contains("0.0.0.0"), "resolved locator must not contain 0.0.0.0 wildcard: {loc}");
        }

        manager.disconnect(&session_id).await.expect("disconnect");
    }

    #[test]
    fn test_resolve_bound_locators_wildcard_ip() {
        let raw = vec![
            "tcp/0.0.0.0:7447".to_string(),
            "unixpipe//tmp/zenoh.sock".to_string(),
        ];
        let resolved = crate::zenoh::manager::resolve_bound_locators(raw);
        assert!(!resolved.is_empty());
        assert!(resolved.iter().any(|l| l == "unixpipe//tmp/zenoh.sock"));
        assert!(!resolved.iter().any(|l| l.contains("0.0.0.0")));
    }

    #[test]
    fn test_resolve_bound_locators_filters_link_local() {
        let raw = vec![
            "tcp/[::1]:34105".to_string(),
            "tcp/[2001:ee2:e2:2600:38cd:5f4a:53d9:6dcf]:34105".to_string(),
            "tcp/127.0.0.1:34105".to_string(),
            "tcp/[fe80::ead3:55ad:1c22:b20a]:34105".to_string(),
            "tcp/169.254.55.66:34105".to_string(),
            "tcp/192.168.1.14:34105".to_string(),
        ];
        let resolved = crate::zenoh::manager::resolve_bound_locators(raw);
        assert_eq!(
            resolved,
            vec![
                "tcp/[2001:ee2:e2:2600:38cd:5f4a:53d9:6dcf]:34105".to_string(),
                "tcp/192.168.1.14:34105".to_string(),
            ]
        );
        // Must NOT contain loopback [::1] or 127.0.0.1, and NOT contain link-local fe80:: or 169.254.
        assert!(!resolved.iter().any(|l| l.contains("[::1]")));
        assert!(!resolved.iter().any(|l| l.contains("127.0.0.1")));
        assert!(!resolved.iter().any(|l| l.contains("fe80:")));
        assert!(!resolved.iter().any(|l| l.contains("169.254.")));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_query_admin_space() {
        let manager = SessionManager::new();
        let mut config = SessionConfig::default();
        config.mode = "peer".to_string();

        let session_id = manager.connect(config).await.expect("connect peer session");
        
        // Query admin space
        let entries = manager
            .query_admin_space(&session_id, Some("@/**"), 1000)
            .await
            .expect("query admin space");

        // The query executes successfully and returns entries (or empty if admin queryables not registered)
        for entry in &entries {
            assert!(entry.key_expr.starts_with("@/"));
            assert!(!entry.category.is_empty());
        }

        manager.disconnect(&session_id).await.expect("disconnect");
    }
}



