#[cfg(test)]
mod tests {
    use crate::zenoh::manager::*;
    use crate::zenoh::types::*;

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
        let socket_path = "/tmp/test_zenoh_stale_sock.sock";
        // Create a dummy stale socket file
        std::fs::write(socket_path, b"stale").expect("create stale socket file");
        assert!(std::path::Path::new(socket_path).exists());

        let mut config = SessionConfig::default_peer();
        config.listen_locators = vec![format!("unixpipe/{socket_path}")];

        let res = config.to_zenoh_config();
        assert!(res.is_ok());
        // The stale socket file should have been cleaned up before binding
        assert!(!std::path::Path::new(socket_path).exists());
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
}



