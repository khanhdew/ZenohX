#[cfg(test)]
mod tests {
    use super::super::*;
    use super::super::models::*;

    #[test]
    fn test_db_init_and_profile_crud() {
        let db = Database::new_in_memory().expect("failed to open in-memory db");
        db.init_tables().expect("failed to init tables");

        let profile = ConnectionProfile {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Test Local Peer".to_string(),
            mode: "peer".to_string(),
            connect_locators: vec!["tcp/127.0.0.1:7447".to_string()],
            listen_locators: vec![],
            scout_multicast: true,
            user_auth: None,
            tls_config: None,
            custom_config: None,
            created_at: 1700000000,
            updated_at: 1700000000,
        };

        db.save_profile(&profile).expect("failed to save profile");
        let profiles = db.get_profiles().expect("failed to get profiles");
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].name, "Test Local Peer");

        let fetched = db.get_profile_by_id(&profile.id).expect("failed to fetch profile");
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().id, profile.id);

        db.delete_profile(&profile.id).expect("failed to delete profile");
        let profiles_after = db.get_profiles().expect("failed to get profiles after delete");
        assert_eq!(profiles_after.len(), 0);
    }

    #[test]
    fn test_preset_crud_and_cascade_delete() {
        let db = Database::new_in_memory().expect("failed to open in-memory db");
        db.init_tables().expect("failed to init tables");

        let profile_id = uuid::Uuid::new_v4().to_string();
        let profile = ConnectionProfile {
            id: profile_id.clone(),
            name: "Cascade Test".to_string(),
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec![],
            scout_multicast: true,
            user_auth: None,
            tls_config: None,
            custom_config: None,
            created_at: 1700000000,
            updated_at: 1700000000,
        };
        db.save_profile(&profile).expect("failed to save profile");

        let preset = SubscriptionPreset {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: profile_id.clone(),
            key_expr: "demo/**".to_string(),
            default_encoding: "json".to_string(),
            auto_subscribe: true,
            color_tag: Some("#ff0000".to_string()),
        };

        db.save_preset(&preset).expect("failed to save preset");
        let presets = db.get_presets(&profile_id).expect("failed to get presets");
        assert_eq!(presets.len(), 1);
        assert_eq!(presets[0].key_expr, "demo/**");

        // Deleting the profile should cascade and delete presets
        db.delete_profile(&profile_id).expect("failed to delete profile");
        let presets_after = db.get_presets(&profile_id).expect("failed to get presets");
        assert_eq!(presets_after.len(), 0);
    }

    #[test]
    fn test_message_history_insert_and_pagination() {
        let db = Database::new_in_memory().expect("failed to open in-memory db");
        db.init_tables().expect("failed to init tables");

        let profile_id = uuid::Uuid::new_v4().to_string();
        let profile = ConnectionProfile {
            id: profile_id.clone(),
            name: "Msg History Test".to_string(),
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec![],
            scout_multicast: true,
            user_auth: None,
            tls_config: None,
            custom_config: None,
            created_at: 1700000000,
            updated_at: 1700000000,
        };
        db.save_profile(&profile).expect("failed to save profile");

        let mut inserted_ids = Vec::new();
        for i in 1..=5 {
            let msg = StoredMessage {
                id: None,
                profile_id: profile_id.clone(),
                direction: "incoming".to_string(),
                key_expr: format!("demo/sensor/{}", i),
                payload: format!("payload-{}", i).into_bytes(),
                encoding: "text".to_string(),
                kind: "put".to_string(),
                timestamp: 1700000000 + i as i64,
            };
            let row_id = db.insert_message(&msg).expect("failed to insert message");
            inserted_ids.push(row_id);
        }

        // Fetch limit 2 offset 0 (ordered by timestamp DESC)
        let page1 = db.get_messages(Some(&profile_id), 2, 0).expect("failed to query page1");
        assert_eq!(page1.len(), 2);
        assert_eq!(page1[0].key_expr, "demo/sensor/5");
        assert_eq!(page1[1].key_expr, "demo/sensor/4");

        // Fetch limit 2 offset 2
        let page2 = db.get_messages(Some(&profile_id), 2, 2).expect("failed to query page2");
        assert_eq!(page2.len(), 2);
        assert_eq!(page2[0].key_expr, "demo/sensor/3");
        assert_eq!(page2[1].key_expr, "demo/sensor/2");

        // Global fetch with None or "__all__"
        let all_msgs = db.get_messages(None, 10, 0).expect("failed to query all");
        assert_eq!(all_msgs.len(), 5);

        let all_str = db.get_messages(Some("__all__"), 10, 0).expect("failed to query __all__");
        assert_eq!(all_str.len(), 5);

        // Delete single message by ID
        db.delete_message_by_id(inserted_ids[0]).expect("failed to delete single message");
        let after_delete_one = db.get_messages(Some(&profile_id), 10, 0).expect("failed to query after delete one");
        assert_eq!(after_delete_one.len(), 4);

        // Clear messages for profile
        db.delete_messages_by_profile(&profile_id).expect("failed to delete messages");
        let after_clear = db.get_messages(Some(&profile_id), 10, 0).expect("failed to query after clear");
        assert_eq!(after_clear.len(), 0);

        // Test inserting with empty profile_id or unsaved profile_id (does not fail FK check)
        let unsaved_msg = StoredMessage {
            id: None,
            profile_id: "unsaved-profile-uuid".to_string(),
            direction: "outgoing".to_string(),
            key_expr: "demo/adhoc".to_string(),
            payload: b"adhoc".to_vec(),
            encoding: "text".to_string(),
            kind: "put".to_string(),
            timestamp: 1700001000,
        };
        let adhoc_id = db.insert_message(&unsaved_msg).expect("inserting ad-hoc msg must succeed");
        assert!(adhoc_id > 0);

        let global_adhoc = db.get_messages(None, 10, 0).expect("querying adhoc message");
        assert_eq!(global_adhoc.len(), 1);
        assert_eq!(global_adhoc[0].key_expr, "demo/adhoc");

        db.clear_all_messages().expect("failed to clear all messages");
        let final_check = db.get_messages(None, 10, 0).expect("final check");
        assert_eq!(final_check.len(), 0);
    }

    #[test]
    fn test_queryable_preset_crud() {
        let db = Database::new_in_memory().expect("failed to open in-memory db");
        db.init_tables().expect("failed to init tables");

        let profile_id = uuid::Uuid::new_v4().to_string();
        let profile = ConnectionProfile {
            id: profile_id.clone(),
            name: "Queryable Preset Test".to_string(),
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec![],
            scout_multicast: true,
            user_auth: None,
            tls_config: None,
            custom_config: None,
            created_at: 1700000000,
            updated_at: 1700000000,
        };
        db.save_profile(&profile).expect("failed to save profile");

        let preset = QueryablePreset {
            id: "qp-1".to_string(),
            profile_id: profile_id.clone(),
            key_expr: "service/rpc/**".to_string(),
            auto_reply: true,
            reply_payload: Some("{\"status\":\"ok\"}".to_string()),
            reply_encoding: "json".to_string(),
        };

        db.save_queryable_preset(&preset).expect("failed to save queryable preset");

        let loaded = db.get_queryable_presets(&profile_id).expect("load presets");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].key_expr, "service/rpc/**");
        assert!(loaded[0].auto_reply);

        db.delete_queryable_preset("qp-1").expect("delete preset");
        let after_del = db.get_queryable_presets(&profile_id).expect("load presets after del");
        assert_eq!(after_del.len(), 0);
    }

    #[test]
    fn test_query_history_crud() {
        let db = Database::new_in_memory().expect("failed to open in-memory db");
        db.init_tables().expect("failed to init tables");

        let profile_id = uuid::Uuid::new_v4().to_string();
        let profile = ConnectionProfile {
            id: profile_id.clone(),
            name: "Query History Test".to_string(),
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec![],
            scout_multicast: true,
            user_auth: None,
            tls_config: None,
            custom_config: None,
            created_at: 1700000000,
            updated_at: 1700000000,
        };
        db.save_profile(&profile).expect("failed to save profile");

        let exec = StoredQueryExecution {
            id: "exec-1".to_string(),
            profile_id: Some(profile_id.clone()),
            selector: "service/rpc/status".to_string(),
            target: "all".to_string(),
            timeout_ms: 2000,
            status: "completed".to_string(),
            replies_json: "[]".to_string(),
            duration_ms: Some(42),
            error: None,
            timestamp: 1700000000,
        };

        db.save_query_execution(&exec).expect("failed to save query execution");

        let history = db.get_query_history(Some(&profile_id), 10, 0).expect("load query history");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].selector, "service/rpc/status");
        assert_eq!(history[0].duration_ms, Some(42));

        let global_history = db.get_query_history(None, 10, 0).expect("load global history");
        assert_eq!(global_history.len(), 1);

        db.delete_query_execution_by_id("exec-1").expect("delete query execution");
        let empty_history = db.get_query_history(Some(&profile_id), 10, 0).expect("load history after delete");
        assert_eq!(empty_history.len(), 0);
    }
}
