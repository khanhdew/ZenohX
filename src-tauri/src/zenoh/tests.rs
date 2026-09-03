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

    struct TestTlsCerts {
        pub dir: std::path::PathBuf,
        pub ca_cert_path: String,
        pub server_cert_path: String,
        pub server_key_path: String,
    }

    impl TestTlsCerts {
        pub fn create() -> Self {
            let dir = std::env::temp_dir().join(format!("zenohx_tls_test_{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&dir).expect("failed to create temp test certs dir");

            let ca_path = dir.join("ca.crt");
            let cert_path = dir.join("server.crt");
            let key_path = dir.join("server.key");

            const CA_CERT: &str = "-----BEGIN CERTIFICATE-----\nMIIDDTCCAfWgAwIBAgIUGRloBVzronZiMJ8b0ionsMcFJBIwDQYJKoZIhvcNAQEL\nBQAwFjEUMBIGA1UEAwwLWmVub2hUZXN0Q0EwHhcNMjYwODI2MTkyMTQ1WhcNMjcw\nODI2MTkyMTQ1WjAWMRQwEgYDVQQDDAtaZW5vaFRlc3RDQTCCASIwDQYJKoZIhvcN\nAQEBBQADggEPADCCAQoCggEBAN8x/cPI+Tvy8ze4TcXIW1ldH7WvVdVz3yUYizF8\ninITn41k5yJvNe496jbBuLY3rfHb87qQaom7s5x/FZzVCtlxqDXAMnitsw+HdHcG\nhdK8rmOidi+9t3FgjKn4et1XtlbRLbMJol/Iyv5Mh2Qgu9jezCPQKy3eYcFsqHAk\n/lqQCTom38kmDCu47Nt2PGlYVfkAmjFZh6f5aGizemy6ylaRZJ8UQ8Ngj5qPD2JP\nQV0IVobjG50kfoNoYth4SC59cX+udLXhJpBZoAv5YKP7jw+T12KGnwDAVGuzWhn7\nSl4DMfZspHC/ODJwlmNH1O4lqY8MJxanj5GK0Cei77XlgBMCAwEAAaNTMFEwHQYD\nVR0OBBYEFOeSbXzixUPKnqmVdPEwqKlm+915MB8GA1UdIwQYMBaAFOeSbXzixUPK\nnqmVdPEwqKlm+915MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEB\nAFd56xMzzz0SYXgWonMdfSR5olL45EFOX6l9ermWtz0ibEugec9PDQxP3rtUM6Ks\n/3Sv2E9gRUO92trbniyC5rzuEmOxWDIxaIA2FxkvtKdzdPO3jnmpFyBovQcnWUw+\nbIst2NsvDtqiqDySJiMBmOcukxvUeJOZTba/FhBO428K10G2SfsFWQDpUzITA/R+\n1M772OjGpnaVDxlhe8mBDh3sDVuv42I993XxtpscJcs1iYRDIB2x9Q54osfzm+R7\n1vBAwhpU1czpseHu2xLyHsL+3DGunGhV009Sv2v/48WhHOU7YjCl9H04QRKDCSxB\n3Nr5Rjb/BMs++26tAbjRcn4=\n-----END CERTIFICATE-----\n";

            const SERVER_CERT: &str = "-----BEGIN CERTIFICATE-----\nMIIDFjCCAf6gAwIBAgIUYlJaA7YoqfkOZCWvdaB8b1AmZKcwDQYJKoZIhvcNAQEL\nBQAwFjEUMBIGA1UEAwwLWmVub2hUZXN0Q0EwHhcNMjYwODI2MTkyMTQ1WhcNMjcw\nODI2MTkyMTQ1WjAUMRIwEAYDVQQDDAkxMjcuMC4wLjEwggEiMA0GCSqGSIb3DQEB\nAQUAA4IBDwAwggEKAoIBAQCxi88Lwm0MOoNnadxOGmT/yGluCQX/TXWTpeU7rPX8\n/PrwmdQAFSzqn6FgMfrAvdyRC1Aje8BT9zBYLpbR5bUh48vwjU3wARuP11Dfo1C0\n8juryKRJl/IvJyVNFz+IE02hYl4tViPxkXHVtUXi2CRb7mPYhwCPX+CgOLmUcupu\ncv4psWRcjY/4FtB93h2DOBJIfHoDbNoCq9V2tJblooWfky0HuvOTrHh36YpTbKaq\nHBvL35tqfbow3c1vQy7+U09NBVMTYOfl+UfvS1Pu63+sEQmmxl1MnNZDtgoEL1cJ\nf7J3Bk227BcOOCl9nDx+FGZcoxQhWYP1K6ifrTb7yDlPAgMBAAGjXjBcMBoGA1Ud\nEQQTMBGHBH8AAAGCCWxvY2FsaG9zdDAdBgNVHQ4EFgQUPKDRI9/blu7bbmnr/Lqx\nH2M0+LgwHwYDVR0jBBgwFoAU55JtfOLFQ8qeqZV08TCoqWb73XkwDQYJKoZIhvcN\nAQELBQADggEBAGBvUWpA6zF3A2qwXQzhNZXXIpIl10DyBiHREEgqAmCO4Fbif9PG\nKsGCkz8AkNPK/LRwKFe4St3ShEnppa3nIrUBqV5Zfj0hnljR17o+4mRBBB0bcCZI\nMuvRKZ8KR1Q3jJeeiItOA5o10HCijp924rEFFs9IhMN9efb5isKNpiwD8jdfgH+6\nMoGjECRU7fyw+I5NUZARtDrRD+WoiWtkYIqTynZ7GW6N3C6fattAuYsTHwrfTSU1\n79atPmCInrb3CfIhIgB+31ikDhEVz3uyFQs9d0WDwDmeLRd1VJWNnqr3XP9b51KZ\n7FRq5+0BP6MOBUN2/khRQ6Ei9r6M20UysDA=\n-----END CERTIFICATE-----\n";

            const SERVER_KEY: &str = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCxi88Lwm0MOoNn\nadxOGmT/yGluCQX/TXWTpeU7rPX8/PrwmdQAFSzqn6FgMfrAvdyRC1Aje8BT9zBY\nLpbR5bUh48vwjU3wARuP11Dfo1C08juryKRJl/IvJyVNFz+IE02hYl4tViPxkXHV\ntUXi2CRb7mPYhwCPX+CgOLmUcupucv4psWRcjY/4FtB93h2DOBJIfHoDbNoCq9V2\ntJblooWfky0HuvOTrHh36YpTbKaqHBvL35tqfbow3c1vQy7+U09NBVMTYOfl+Ufv\nS1Pu63+sEQmmxl1MnNZDtgoEL1cJf7J3Bk227BcOOCl9nDx+FGZcoxQhWYP1K6if\nrTb7yDlPAgMBAAECggEARnZXjfG0KIHCa9TaD48vHUpS+U4QeMGrk5Tn1Jawq55V\nEw7h0cSVpmoC+DPtsffH5TKJtANlkY1NPPoEdjoFeHU5F3dlAobWAvCvkon0ulNW\ndjczaFeq0KbnCWDcIGuUyCNLgA+rRTB1bpy6JyyjxW5nZuQxRzWEZuIMWMuAmaNV\nP4QgNqqUnINQ3pd2BmNA0ikS9xH7p3Xbg4bx/dgnpiul7Zb0tt4F783kzH6qnmCW\neg20dMnaNbbxhABzmLr6STdcLHHJbWpWcQR0LH2RzU2+UdYqzMtbp4uAVNSU5Pg1\n65vrEc2xqQVfMfHhY8KYXxZlVAhOPX22//NOebcQLQKBgQDdSfnVVpkGUIPYi32o\nFOvKyskNPabYFf1/aS9CXKPe3DQyEzyuQzDhb1RmXQfFrk6ynOgFlaCL0SoV1fMO\n6uDwb51y7ifk1/JKu0jbNb98Yq3QjYYHMAxh3ZcYI473ot2iZJtbZ5VZvZQ/fqUK\n0VVI9d0F1eE3gx9v/D4HOCOU5QKBgQDNZU5u2FZFhgL+JgR2z2+0m0ESpJCwLD08\nTkpI1t4baLaVP+NstgGkgnq6Ghkor6sNTAA6GVNmbnRae+EPl8JwiknyCAAjUlZD\nL2eEsABN2GUDX0vG6Z9gYpDxSyDy3dSPpKKtoZw0JuSMSWn5gwOltE5HFQeHnbRw\nw5O81l+GIwKBgFi5wX9FgoOiosqfW1maUdR0rFovvwbjAkokvXspM9c2iYMObYUd\nkarB/aAxat1a/1jkSq96h+2nhu1MZHE1wc0Fo6aiUMKTxyUppJOoIEfaNQDqzbNy\nE3Tl6SAXmco2thDXr+bdSGe7+IXg3IHS3xQq6FzfnbapT2CSTbiNTM71AoGAJqVY\nE50a5mvnpkAq+Nvg7b+Eh+h03OEGCJHGglwDYG7cY8qolOzN9FEknF2KvFAJRDA3\nnrbjLVO9CsViPFfWmuw6K5L7y6mTV4LU3G9tLzh3ESJeFKgid7U0BmKXaXr5oqlc\nfoT46gsjV438pZjUF9qMG+3GA+tVZx41bwN657cCgYEAnxfwy+/Ysu7C4VICFPJx\nncAI3JNWTj//0SRBT3bcmMMZQukDXC6ETdzg/Cei2wslAySBe6ZZyeTlGLzDx83v\n0ovWZ+OAKIaPrA8nw5bcPrP6h/t9OKZsVgAYDx2ghOTeEFKx1Xgf2an/RW+Wf3BP\nHZG4ISYqQzjl9/k8hYYfX24=\n-----END PRIVATE KEY-----\n";

            std::fs::write(&ca_path, CA_CERT).expect("write ca.crt failed");
            std::fs::write(&cert_path, SERVER_CERT).expect("write server.crt failed");
            std::fs::write(&key_path, SERVER_KEY).expect("write server.key failed");

            Self {
                dir,
                ca_cert_path: ca_path.to_string_lossy().to_string(),
                server_cert_path: cert_path.to_string_lossy().to_string(),
                server_key_path: key_path.to_string_lossy().to_string(),
            }
        }
    }

    impl Drop for TestTlsCerts {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_zenoh_tls_router_and_client_connection() {
        let certs = TestTlsCerts::create();
        let manager = Arc::new(SessionManager::new());

        // 1. Router with Server Cert & Key on dynamic ephemeral port
        let router_config = SessionConfig {
            profile_id: Some("tls-router-1".to_string()),
            mode: "router".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tls/127.0.0.1:0".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: Some(TlsConfig {
                ca_cert: Some(certs.ca_cert_path.clone()),
                client_cert: Some(certs.server_cert_path.clone()),
                client_key: Some(certs.server_key_path.clone()),
                tls_only: Some(true),
            }),
            custom_config: None,
        };

        let router_session_id = manager.connect(router_config).await.expect("Router connect failed");
        let router_info = manager.get_session_info(&router_session_id).await.expect("Router info failed");
        let router_locator = router_info
            .bound_locators
            .first()
            .expect("router should have bound locator")
            .clone();

        // 2. Client with Root CA
        let client_config = SessionConfig {
            profile_id: Some("tls-client-1".to_string()),
            mode: "client".to_string(),
            connect_locators: vec![router_locator.clone()],
            listen_locators: vec![],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: Some(TlsConfig {
                ca_cert: Some(certs.ca_cert_path.clone()),
                client_cert: None,
                client_key: None,
                tls_only: Some(true),
            }),
            custom_config: None,
        };

        let client_session_id = manager.connect(client_config).await;
        assert!(client_session_id.is_ok(), "Client connect with Root CA failed: {:?}", client_session_id.err());

        let client_id = client_session_id.unwrap();
        let _ = manager.disconnect(&client_id).await;

        // 3. Peer connecting to TLS Router with Root CA (listening on dynamic TCP 0.0.0.0:0)
        let peer_config = SessionConfig {
            profile_id: Some("tls-peer-1".to_string()),
            mode: "peer".to_string(),
            connect_locators: vec![router_locator],
            listen_locators: vec!["tcp/0.0.0.0:0".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: Some(TlsConfig {
                ca_cert: Some(certs.ca_cert_path.clone()),
                client_cert: None,
                client_key: None,
                tls_only: None,
            }),
            custom_config: None,
        };
        let peer_session_id = manager.connect(peer_config).await;
        assert!(peer_session_id.is_ok(), "Peer connect to TLS Router failed: {:?}", peer_session_id.err());
        let peer_id = peer_session_id.unwrap();
        let _ = manager.disconnect(&peer_id).await;

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

    #[test]
    fn test_peer_and_client_do_not_save_or_load_listen_endpoints_in_json5() {
        // 1. Peer mode - generate_json5 should never output "listen"
        let peer_config = SessionConfig {
            profile_id: Some("peer-prof-1".to_string()),
            mode: "peer".to_string(),
            connect_locators: vec!["tcp/10.0.0.1:7447".to_string()],
            listen_locators: vec!["tcp/192.168.1.50:43219".to_string()],
            scout_multicast: true,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: Some(serde_json::json!({
                "listen": {
                    "endpoints": ["tcp/192.168.1.50:43219"]
                },
                "listen/endpoints": "[\"tcp/192.168.1.50:43219\"]",
                "transport": { "unicast": { "max_sessions": 10 } }
            })),
        };

        let live_bound = vec!["tcp/192.168.1.50:43219".to_string()];
        let peer_json5 = peer_config.generate_json5(Some("peer-prof-1"), &live_bound);
        let peer_parsed: serde_json::Value = serde_json::from_str(&peer_json5).expect("parse peer json5");

        assert_eq!(peer_parsed.get("mode").and_then(|v| v.as_str()), Some("peer"));
        assert!(peer_parsed.get("listen").is_none(), "Peer mode must NOT have 'listen' in JSON5");
        assert!(peer_parsed.get("listen/endpoints").is_none(), "Peer mode must NOT have 'listen/endpoints' in JSON5");
        assert!(peer_parsed.get("transport").is_some(), "Other custom config must be preserved");

        // 2. Client mode - generate_json5 should never output "listen"
        let client_config = SessionConfig {
            profile_id: Some("client-prof-1".to_string()),
            mode: "client".to_string(),
            connect_locators: vec!["tcp/10.0.0.1:7447".to_string()],
            listen_locators: vec!["tcp/0.0.0.0:0".to_string()],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: Some(serde_json::json!({
                "listen": {
                    "endpoints": ["tcp/127.0.0.1:7447"]
                }
            })),
        };

        let client_json5 = client_config.generate_json5(Some("client-prof-1"), &[]);
        let client_parsed: serde_json::Value = serde_json::from_str(&client_json5).expect("parse client json5");

        assert_eq!(client_parsed.get("mode").and_then(|v| v.as_str()), Some("client"));
        assert!(client_parsed.get("listen").is_none(), "Client mode must NOT have 'listen' in JSON5");

        // 3. Router mode - generate_json5 MUST output "listen"
        let router_config = SessionConfig {
            profile_id: Some("router-prof-1".to_string()),
            mode: "router".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tcp/0.0.0.0:7447".to_string()],
            scout_multicast: true,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        };

        let router_json5 = router_config.generate_json5(Some("router-prof-1"), &[]);
        let router_parsed: serde_json::Value = serde_json::from_str(&router_json5).expect("parse router json5");

        assert_eq!(router_parsed.get("mode").and_then(|v| v.as_str()), Some("router"));
        assert!(router_parsed.get("listen").is_some(), "Router mode MUST have 'listen' in JSON5");
        let listen_eps = router_parsed["listen"]["endpoints"].as_array().expect("listen endpoints array");
        assert_eq!(listen_eps[0].as_str(), Some("tcp/0.0.0.0:7447"));

        // 4. to_zenoh_config should NOT load listen endpoints from custom_config for peer or client
        let mut peer_no_listen = peer_config.clone();
        peer_no_listen.listen_locators = vec![];
        let peer_zenoh_cfg = peer_no_listen.to_zenoh_config().expect("to_zenoh_config peer");
        let peer_cfg_debug = format!("{:?}", peer_zenoh_cfg);
        // The peer config should not have configured listen endpoints from custom_config
        assert!(!peer_cfg_debug.contains("43219"), "Peer must not load listen endpoint from custom_config");

        let client_zenoh_cfg = client_config.to_zenoh_config().expect("to_zenoh_config client");
        let client_cfg_debug = format!("{:?}", client_zenoh_cfg);
        assert!(!client_cfg_debug.contains("127.0.0.1:7447"), "Client must not load listen endpoints from custom_config");
        assert!(!client_cfg_debug.contains("0.0.0.0:0"), "Client must not load listen endpoints from listen_locators");

        let router_zenoh_cfg = router_config.to_zenoh_config().expect("to_zenoh_config router");
        let router_cfg_debug = format!("{:?}", router_zenoh_cfg);
        assert!(router_cfg_debug.contains("7447"), "Router must have listen endpoints configured");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_get_node_configuration_json5_peer_vs_router() {
        let manager = SessionManager::new();

        // 1. Connect peer session
        let mut peer_cfg = SessionConfig::default_peer();
        peer_cfg.listen_locators = vec!["tcp/0.0.0.0:0".to_string()];
        let peer_id = manager.connect(peer_cfg).await.expect("connect peer");
        let peer_info = manager.get_session_info(&peer_id).await.expect("get peer info");

        let peer_node_cfg = manager.get_node_configuration(&peer_info.zid).await.expect("get peer node config");
        assert_eq!(peer_node_cfg.mode, "peer");
        let parsed_peer_json5: serde_json::Value = serde_json::from_str(&peer_node_cfg.json5).expect("parse peer json5");
        assert!(parsed_peer_json5.get("listen").is_none(), "Peer node configuration JSON5 must NOT contain 'listen'");

        manager.disconnect(&peer_id).await.expect("disconnect peer");

        // 2. Connect router session
        let mut router_cfg = SessionConfig::default();
        router_cfg.mode = "router".to_string();
        router_cfg.listen_locators = vec!["tcp/127.0.0.1:17499".to_string()];
        let router_id = manager.connect(router_cfg).await.expect("connect router");
        let router_info = manager.get_session_info(&router_id).await.expect("get router info");

        let router_node_cfg = manager.get_node_configuration(&router_info.zid).await.expect("get router node config");
        assert_eq!(router_node_cfg.mode, "router");
        let parsed_router_json5: serde_json::Value = serde_json::from_str(&router_node_cfg.json5).expect("parse router json5");
        assert!(parsed_router_json5.get("listen").is_some(), "Router node configuration JSON5 MUST contain 'listen'");

        manager.disconnect(&router_id).await.expect("disconnect router");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_router_ephemeral_listen_locator_allocates_random_port() {
        let manager = SessionManager::new();

        // Configure router with ephemeral port 0 (tcp/0.0.0.0:0)
        let mut router_cfg = SessionConfig::default();
        router_cfg.mode = "router".to_string();
        router_cfg.listen_locators = vec!["tcp/0.0.0.0:0".to_string()];

        let router_id = manager.connect(router_cfg).await.expect("connect router on ephemeral port");
        let router_info = manager.get_session_info(&router_id).await.expect("get router info");

        // The bound locator should have been assigned a non-zero port
        assert!(!router_info.bound_locators.is_empty());
        let bound = &router_info.bound_locators[0];
        assert!(!bound.contains(":0"), "Bound locator should resolve to actual allocated port, got: {bound}");

        manager.disconnect(&router_id).await.expect("disconnect router");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_router_creation_allocates_random_port_and_retains_for_reconnect() {
        let db = Database::new_in_memory().expect("failed to init in-memory db");
        db.init_tables().expect("failed to init tables");
        let manager = Arc::new(SessionManager::new());

        let profile_id = "test-ephemeral-router".to_string();
        let profile = ConnectionProfile {
            id: profile_id.clone(),
            name: "Ephemeral Router".to_string(),
            mode: "router".to_string(),
            connect_locators: vec![],
            listen_locators: vec!["tcp/0.0.0.0:0".to_string()],
            scout_multicast: false,
            user_auth: None,
            tls_config: None,
            custom_config: None,
            created_at: 1000,
            updated_at: 1000,
        };
        db.save_profile(&profile).expect("failed to save profile");

        // Step 1: First connect -> loads tcp/0.0.0.0:0 -> Zenoh allocates random port
        let loaded = db.get_profile_by_id(&profile_id).unwrap().unwrap();
        let config = SessionConfig {
            profile_id: Some(loaded.id.clone()),
            mode: loaded.mode.clone(),
            connect_locators: loaded.connect_locators.clone(),
            listen_locators: loaded.listen_locators.clone(),
            scout_multicast: loaded.scout_multicast,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: loaded.custom_config.clone(),
        };

        let session_id = manager.connect(config).await.expect("connect on ephemeral port");
        let session_info = manager.get_session_info(&session_id).await.expect("get session info");

        assert!(!session_info.bound_locators.is_empty());
        let allocated_bound = session_info.bound_locators[0].clone();
        assert!(!allocated_bound.contains(":0"));

        // Simulate connect_node_by_zid post-connect retention
        let mut updated = loaded.clone();
        if updated.listen_locators.iter().any(|l| l.contains(":0")) {
            updated.listen_locators = session_info.bound_locators.clone();
            db.save_profile(&updated).expect("retain allocated port in db");
        }

        manager.disconnect(&session_id).await.expect("disconnect first session");

        // Step 2: Verify retained in SQLite
        let retained_profile = db.get_profile_by_id(&profile_id).unwrap().unwrap();
        let mut expected_sorted = session_info.bound_locators.clone();
        expected_sorted.sort();
        let mut retained_sorted = retained_profile.listen_locators.clone();
        retained_sorted.sort();
        assert_eq!(retained_sorted, expected_sorted);

        // Step 3: Reconnect -> uses the retained IP:Port
        let reconnect_config = SessionConfig {
            profile_id: Some(retained_profile.id.clone()),
            mode: retained_profile.mode.clone(),
            connect_locators: retained_profile.connect_locators.clone(),
            listen_locators: retained_profile.listen_locators.clone(),
            scout_multicast: retained_profile.scout_multicast,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: retained_profile.custom_config.clone(),
        };

        let reconnect_id = manager.connect(reconnect_config).await.expect("reconnect on retained port");
        let reconnect_info = manager.get_session_info(&reconnect_id).await.expect("get reconnect info");

        let mut reconnect_sorted = reconnect_info.bound_locators.clone();
        reconnect_sorted.sort();
        assert_eq!(reconnect_sorted, expected_sorted);
        manager.disconnect(&reconnect_id).await.expect("disconnect reconnect session");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_remote_node_configuration_extracts_connect_locators() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();

        let remote_zid = "a1b2c3d4e5f60718";
        let q1_key = format!("@/{remote_zid}/session/link/link0");
        let q1_id = uuid::Uuid::new_v4();
        manager
            .declare_queryable(&session_id, q1_id, &q1_key, move |query| async move {
                let _ = query
                    .reply(
                        &query.key_expr,
                        br#"{"dst": "tcp/192.168.1.100:7447", "src": "tcp/127.0.0.1:0"}"#.to_vec(),
                    )
                    .await;
            })
            .await
            .unwrap();

        let q2_key = format!("@/{remote_zid}/config");
        let q2_id = uuid::Uuid::new_v4();
        manager
            .declare_queryable(&session_id, q2_id, &q2_key, move |query| async move {
                let _ = query
                    .reply(
                        &query.key_expr,
                        br#"{"connect": {"endpoints": ["tcp/10.0.0.5:7447", "tcp/127.0.0.1:7447"]}}"#.to_vec(),
                    )
                    .await;
            })
            .await
            .unwrap();

        let q3_key = format!("@/{remote_zid}/session/info");
        let q3_id = uuid::Uuid::new_v4();
        manager
            .declare_queryable(&session_id, q3_id, &q3_key, move |query| async move {
                let _ = query
                    .reply(&query.key_expr, br#"{"whatami": "router"}"#.to_vec())
                    .await;
            })
            .await
            .unwrap();

        // Inbound link with ephemeral client port (>= 32768) - must NOT be treated as connect locator
        let q4_key = format!("@/{remote_zid}/session/link/link_ephemeral");
        let q4_id = uuid::Uuid::new_v4();
        manager
            .declare_queryable(&session_id, q4_id, &q4_key, move |query| async move {
                let _ = query
                    .reply(
                        &query.key_expr,
                        br#"{"dst": "tcp/192.168.1.50:49152", "src": "tcp/127.0.0.1:0"}"#.to_vec(),
                    )
                    .await;
            })
            .await
            .unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let res = manager
            .get_node_configuration(remote_zid)
            .await
            .expect("get remote node configuration");

        assert_eq!(res.zid, remote_zid);
        assert_eq!(res.status, "remote");
        assert_eq!(res.mode, "router");
        assert!(!res.is_local);
        // Verify ephemeral port 49152 is excluded, only static ports 7447 are kept
        assert_eq!(
            res.connect_locators,
            vec!["tcp/10.0.0.5:7447".to_string(), "tcp/192.168.1.100:7447".to_string()]
        );
        assert!(!res.connect_locators.contains(&"tcp/192.168.1.50:49152".to_string()));

        manager.disconnect(&session_id).await.unwrap();
    }

    #[test]
    fn test_is_ephemeral_port_locator() {
        assert!(is_ephemeral_port_locator("tcp/192.168.1.50:49152"));
        assert!(is_ephemeral_port_locator("tcp/10.0.0.1:32768"));
        assert!(is_ephemeral_port_locator("tls/example.com:65535"));
        assert!(!is_ephemeral_port_locator("tcp/192.168.1.100:7447"));
        assert!(!is_ephemeral_port_locator("tcp/10.0.0.1:8080"));
        assert!(!is_ephemeral_port_locator("tcp/10.0.0.1:32767"));
        assert!(!is_ephemeral_port_locator("unix//tmp/zenoh.sock"));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_discover_admin_topology_bounds_depth() {
        let manager = SessionManager::new();
        let session_id = manager.connect(SessionConfig::default_peer()).await.unwrap();

        // 1. Invalid session returns error
        let invalid_sid = uuid::Uuid::new_v4();
        let err_res = manager.discover_admin_topology(&invalid_sid, 3, 1000).await;
        assert!(err_res.is_err());

        // 2. Mock a cycle between routers: r1 -> r2, r2 -> r1
        let r1_zid = "1111111111111111";
        let r2_zid = "2222222222222222";
        let q1_id = uuid::Uuid::new_v4();
        let q2_id = uuid::Uuid::new_v4();

        let k1 = format!("@/{r1_zid}/router/{r2_zid}");
        let k2 = format!("@/{r2_zid}/router/{r1_zid}");

        manager
            .declare_queryable(&session_id, q1_id, &k1, move |query| async move {
                let _ = query.reply(&query.key_expr, b"{}".to_vec()).await;
            })
            .await
            .unwrap();

        manager
            .declare_queryable(&session_id, q2_id, &k2, move |query| async move {
                let _ = query.reply(&query.key_expr, b"{}".to_vec()).await;
            })
            .await
            .unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        // Bounded depth test with max_depth = 2
        let entries = manager
            .discover_admin_topology(&session_id, 2, 1000)
            .await
            .expect("discover admin topology");

        // Verify entries were returned and cycle did not cause infinite loop
        assert!(!entries.is_empty());

        manager.disconnect(&session_id).await.unwrap();
    }
}



