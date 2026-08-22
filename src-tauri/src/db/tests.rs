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
            db.insert_message(&msg).expect("failed to insert message");
        }

        // Fetch limit 2 offset 0 (ordered by timestamp DESC)
        let page1 = db.get_messages(&profile_id, 2, 0).expect("failed to query page1");
        assert_eq!(page1.len(), 2);
        assert_eq!(page1[0].key_expr, "demo/sensor/5");
        assert_eq!(page1[1].key_expr, "demo/sensor/4");

        // Fetch limit 2 offset 2
        let page2 = db.get_messages(&profile_id, 2, 2).expect("failed to query page2");
        assert_eq!(page2.len(), 2);
        assert_eq!(page2[0].key_expr, "demo/sensor/3");
        assert_eq!(page2[1].key_expr, "demo/sensor/2");

        // Clear messages for profile
        db.delete_messages_by_profile(&profile_id).expect("failed to delete messages");
        let after_clear = db.get_messages(&profile_id, 10, 0).expect("failed to query after clear");
        assert_eq!(after_clear.len(), 0);
    }
}
