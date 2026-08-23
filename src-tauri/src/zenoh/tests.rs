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
}
