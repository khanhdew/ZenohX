use std::path::Path;
use std::sync::Arc;
use parking_lot::Mutex;
use rusqlite::{Connection, Result};

use crate::db::models::{ConnectionProfile, StoredMessage, SubscriptionPreset};
use crate::db::schema;

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Opens or creates a SQLite database at the specified file path.
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        schema::initialize_schema(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Opens an in-memory SQLite database (useful for testing and temporary sessions).
    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Explicitly initializes tables and indexes in the database.
    pub fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock();
        schema::initialize_schema(&conn)?;
        Ok(())
    }

    // ==========================================
    // Connection Profiles CRUD
    // ==========================================

    /// Saves or updates a connection profile.
    pub fn save_profile(&self, profile: &ConnectionProfile) -> Result<()> {
        let conn = self.conn.lock();
        let connect_locators_json = serde_json::to_string(&profile.connect_locators)
            .unwrap_or_else(|_| "[]".to_string());
        let listen_locators_json = serde_json::to_string(&profile.listen_locators)
            .unwrap_or_else(|_| "[]".to_string());
        let user_auth_json = profile.user_auth.as_ref().map(|v| v.to_string());
        let tls_config_json = profile.tls_config.as_ref().map(|v| v.to_string());
        let custom_config_json = profile.custom_config.as_ref().map(|v| v.to_string());
        let scout_multicast = if profile.scout_multicast { 1 } else { 0 };

        conn.execute(
            "INSERT OR REPLACE INTO connection_profiles (
                id, name, mode, connect_locators, listen_locators, scout_multicast,
                user_auth, tls_config, custom_config, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                profile.id,
                profile.name,
                profile.mode,
                connect_locators_json,
                listen_locators_json,
                scout_multicast,
                user_auth_json,
                tls_config_json,
                custom_config_json,
                profile.created_at,
                profile.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Fetches all stored connection profiles sorted by update time (most recent first).
    pub fn get_profiles(&self) -> Result<Vec<ConnectionProfile>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, mode, connect_locators, listen_locators, scout_multicast,
                    user_auth, tls_config, custom_config, created_at, updated_at
             FROM connection_profiles
             ORDER BY updated_at DESC, name ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            let connect_locators_str: String = row.get(3)?;
            let listen_locators_str: Option<String> = row.get(4)?;
            let scout_multicast_int: i64 = row.get(5)?;
            let user_auth_str: Option<String> = row.get(6)?;
            let tls_config_str: Option<String> = row.get(7)?;
            let custom_config_str: Option<String> = row.get(8)?;

            Ok(ConnectionProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                mode: row.get(2)?,
                connect_locators: serde_json::from_str(&connect_locators_str).unwrap_or_default(),
                listen_locators: listen_locators_str
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                scout_multicast: scout_multicast_int != 0,
                user_auth: user_auth_str.and_then(|s| serde_json::from_str(&s).ok()),
                tls_config: tls_config_str.and_then(|s| serde_json::from_str(&s).ok()),
                custom_config: custom_config_str.and_then(|s| serde_json::from_str(&s).ok()),
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut profiles = Vec::new();
        for profile in rows {
            profiles.push(profile?);
        }
        Ok(profiles)
    }

    /// Fetches a connection profile by its ID.
    pub fn get_profile_by_id(&self, id: &str) -> Result<Option<ConnectionProfile>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, mode, connect_locators, listen_locators, scout_multicast,
                    user_auth, tls_config, custom_config, created_at, updated_at
             FROM connection_profiles
             WHERE id = ?1",
        )?;

        let mut rows = stmt.query_map(rusqlite::params![id], |row| {
            let connect_locators_str: String = row.get(3)?;
            let listen_locators_str: Option<String> = row.get(4)?;
            let scout_multicast_int: i64 = row.get(5)?;
            let user_auth_str: Option<String> = row.get(6)?;
            let tls_config_str: Option<String> = row.get(7)?;
            let custom_config_str: Option<String> = row.get(8)?;

            Ok(ConnectionProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                mode: row.get(2)?,
                connect_locators: serde_json::from_str(&connect_locators_str).unwrap_or_default(),
                listen_locators: listen_locators_str
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                scout_multicast: scout_multicast_int != 0,
                user_auth: user_auth_str.and_then(|s| serde_json::from_str(&s).ok()),
                tls_config: tls_config_str.and_then(|s| serde_json::from_str(&s).ok()),
                custom_config: custom_config_str.and_then(|s| serde_json::from_str(&s).ok()),
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        if let Some(profile) = rows.next() {
            Ok(Some(profile?))
        } else {
            Ok(None)
        }
    }

    /// Deletes a connection profile (and cascades to its presets and messages).
    pub fn delete_profile(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM connection_profiles WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    // ==========================================
    // Subscription Presets CRUD
    // ==========================================

    /// Saves or updates a subscription preset.
    pub fn save_preset(&self, preset: &SubscriptionPreset) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO subscription_presets (
                id, profile_id, key_expr, default_encoding, auto_subscribe, color_tag
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                preset.id,
                preset.profile_id,
                preset.key_expr,
                preset.default_encoding,
                if preset.auto_subscribe { 1 } else { 0 },
                preset.color_tag,
            ],
        )?;
        Ok(())
    }

    /// Fetches all subscription presets associated with a profile ID.
    pub fn get_presets(&self, profile_id: &str) -> Result<Vec<SubscriptionPreset>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, profile_id, key_expr, default_encoding, auto_subscribe, color_tag
             FROM subscription_presets
             WHERE profile_id = ?1
             ORDER BY key_expr ASC",
        )?;

        let rows = stmt.query_map(rusqlite::params![profile_id], |row| {
            let auto_sub_int: i64 = row.get(4)?;
            Ok(SubscriptionPreset {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                key_expr: row.get(2)?,
                default_encoding: row.get(3)?,
                auto_subscribe: auto_sub_int != 0,
                color_tag: row.get(5)?,
            })
        })?;

        let mut presets = Vec::new();
        for preset in rows {
            presets.push(preset?);
        }
        Ok(presets)
    }

    /// Deletes a subscription preset by ID.
    pub fn delete_preset(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM subscription_presets WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    // ==========================================
    // Message History CRUD
    // ==========================================

    /// Inserts a message sample into history and returns the generated row ID.
    pub fn insert_message(&self, message: &StoredMessage) -> Result<i64> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO message_history (
                profile_id, direction, key_expr, payload, encoding, kind, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                message.profile_id,
                message.direction,
                message.key_expr,
                message.payload,
                message.encoding,
                message.kind,
                message.timestamp,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Fetches messages for a given profile with limit and offset pagination (newest first).
    pub fn get_messages(&self, profile_id: &str, limit: u32, offset: u32) -> Result<Vec<StoredMessage>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, profile_id, direction, key_expr, payload, encoding, kind, timestamp
             FROM message_history
             WHERE profile_id = ?1
             ORDER BY timestamp DESC, id DESC
             LIMIT ?2 OFFSET ?3",
        )?;

        let rows = stmt.query_map(rusqlite::params![profile_id, limit, offset], |row| {
            Ok(StoredMessage {
                id: Some(row.get(0)?),
                profile_id: row.get(1)?,
                direction: row.get(2)?,
                key_expr: row.get(3)?,
                payload: row.get(4)?,
                encoding: row.get(5)?,
                kind: row.get(6)?,
                timestamp: row.get(7)?,
            })
        })?;

        let mut messages = Vec::new();
        for msg in rows {
            messages.push(msg?);
        }
        Ok(messages)
    }

    /// Deletes all stored messages for a specific connection profile.
    pub fn delete_messages_by_profile(&self, profile_id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM message_history WHERE profile_id = ?1", rusqlite::params![profile_id])?;
        Ok(())
    }

    /// Clears the entire message history table.
    pub fn clear_all_messages(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM message_history", [])?;
        Ok(())
    }
}
