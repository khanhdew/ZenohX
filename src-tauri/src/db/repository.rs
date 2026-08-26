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

use std::path::Path;
use std::sync::Arc;
use parking_lot::Mutex;
use rusqlite::{Connection, Result};

use crate::db::models::{
    ConnectionProfile, QueryablePreset, StoredMessage, StoredQueryExecution, SubscriptionPreset,
};
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

        let rows = stmt.query_map([], map_profile_row)?;

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

        let mut rows = stmt.query_map(rusqlite::params![id], map_profile_row)?;

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
        // Check if profile exists before inserting to ensure FK integrity
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM connection_profiles WHERE id = ?1",
                rusqlite::params![preset.profile_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !exists {
            return Ok(());
        }

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

    /// Fetches all subscription presets associated with a profile ID (or all if empty / "__all__").
    pub fn get_presets(&self, profile_id: &str) -> Result<Vec<SubscriptionPreset>> {
        let conn = self.conn.lock();
        let target = profile_id.trim();

        let mut presets = Vec::new();
        if target.is_empty() || target == "__all__" {
            let mut stmt = conn.prepare(
                "SELECT id, profile_id, key_expr, default_encoding, auto_subscribe, color_tag
                 FROM subscription_presets
                 ORDER BY key_expr ASC",
            )?;

            let rows = stmt.query_map([], map_preset_row)?;
            for preset in rows {
                presets.push(preset?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, profile_id, key_expr, default_encoding, auto_subscribe, color_tag
                 FROM subscription_presets
                 WHERE profile_id = ?1
                 ORDER BY key_expr ASC",
            )?;

            let rows = stmt.query_map(rusqlite::params![target], map_preset_row)?;
            for preset in rows {
                presets.push(preset?);
            }
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
        let profile_id_param: Option<&str> = if message.profile_id.trim().is_empty() {
            None
        } else {
            // Verify if profile exists in database to ensure FK consistency
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM connection_profiles WHERE id = ?1",
                    rusqlite::params![message.profile_id],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            if exists {
                Some(message.profile_id.as_str())
            } else {
                None
            }
        };

        conn.execute(
            "INSERT INTO message_history (
                profile_id, direction, key_expr, payload, encoding, kind, timestamp, source_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                profile_id_param,
                message.direction,
                message.key_expr,
                message.payload,
                message.encoding,
                message.kind,
                message.timestamp,
                message.source_id,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Inserts a batch of stored messages within a single SQLite transaction.
    pub fn insert_messages_batch(&self, messages: &[StoredMessage]) -> Result<()> {
        if messages.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO message_history (
                    profile_id, direction, key_expr, payload, encoding, kind, timestamp, source_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;

            for msg in messages {
                let profile_id_param = if msg.profile_id.trim().is_empty() {
                    None
                } else {
                    Some(msg.profile_id.as_str())
                };

                stmt.execute(rusqlite::params![
                    profile_id_param,
                    msg.direction,
                    msg.key_expr,
                    msg.payload,
                    msg.encoding,
                    msg.kind,
                    msg.timestamp,
                    msg.source_id,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Fetches messages for a given profile with limit and offset pagination (newest first).
    /// If profile_id is None, empty, or "__all__", queries across all profiles.
    pub fn get_messages(
        &self,
        profile_id: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<StoredMessage>> {
        let conn = self.conn.lock();
        let target = profile_id.unwrap_or("").trim();

        let mut messages = Vec::new();
        if target.is_empty() || target == "__all__" {
            let mut stmt = conn.prepare(
                "SELECT id, profile_id, direction, key_expr, payload, encoding, kind, timestamp, source_id
                 FROM message_history
                 ORDER BY timestamp DESC, id DESC
                 LIMIT ?1 OFFSET ?2",
            )?;

            let rows = stmt.query_map(rusqlite::params![limit, offset], map_message_row)?;
            for msg in rows {
                messages.push(msg?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, profile_id, direction, key_expr, payload, encoding, kind, timestamp, source_id
                 FROM message_history
                 WHERE profile_id = ?1
                 ORDER BY timestamp DESC, id DESC
                 LIMIT ?2 OFFSET ?3",
            )?;

            let rows = stmt.query_map(rusqlite::params![target, limit, offset], map_message_row)?;
            for msg in rows {
                messages.push(msg?);
            }
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

    /// Deletes a specific message by its row ID.
    pub fn delete_message_by_id(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM message_history WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    // ==========================================
    // Queryable Presets CRUD
    // ==========================================

    /// Saves or updates a queryable preset.
    pub fn save_queryable_preset(&self, preset: &QueryablePreset) -> Result<()> {
        let conn = self.conn.lock();
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM connection_profiles WHERE id = ?1",
                rusqlite::params![preset.profile_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !exists {
            return Ok(());
        }

        conn.execute(
            "INSERT OR REPLACE INTO queryable_presets (
                id, profile_id, key_expr, auto_reply, reply_payload, reply_encoding
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                preset.id,
                preset.profile_id,
                preset.key_expr,
                if preset.auto_reply { 1 } else { 0 },
                preset.reply_payload,
                preset.reply_encoding,
            ],
        )?;
        Ok(())
    }

    /// Fetches all queryable presets for a profile (or all if empty / "__all__").
    pub fn get_queryable_presets(&self, profile_id: &str) -> Result<Vec<QueryablePreset>> {
        let conn = self.conn.lock();
        let target = profile_id.trim();

        let mut presets = Vec::new();
        if target.is_empty() || target == "__all__" {
            let mut stmt = conn.prepare(
                "SELECT id, profile_id, key_expr, auto_reply, reply_payload, reply_encoding
                 FROM queryable_presets
                 ORDER BY key_expr ASC",
            )?;
            let rows = stmt.query_map([], map_queryable_preset_row)?;
            for preset in rows {
                presets.push(preset?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, profile_id, key_expr, auto_reply, reply_payload, reply_encoding
                 FROM queryable_presets
                 WHERE profile_id = ?1
                 ORDER BY key_expr ASC",
            )?;
            let rows = stmt.query_map(rusqlite::params![target], map_queryable_preset_row)?;
            for preset in rows {
                presets.push(preset?);
            }
        }

        Ok(presets)
    }

    /// Deletes a queryable preset by ID.
    pub fn delete_queryable_preset(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM queryable_presets WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    // ==========================================
    // Query History CRUD
    // ==========================================

    /// Saves or updates a query execution record.
    pub fn save_query_execution(&self, execution: &StoredQueryExecution) -> Result<()> {
        let conn = self.conn.lock();
        let profile_id = match execution.profile_id {
            Some(ref pid) if !pid.trim().is_empty() => {
                let exists: bool = conn
                    .query_row(
                        "SELECT 1 FROM connection_profiles WHERE id = ?1",
                        rusqlite::params![pid],
                        |_| Ok(true),
                    )
                    .unwrap_or(false);
                if exists {
                    Some(pid.clone())
                } else {
                    None
                }
            }
            _ => None,
        };

        conn.execute(
            "INSERT OR REPLACE INTO query_history (
                id, profile_id, selector, target, timeout_ms, status, replies_json, duration_ms, error, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                execution.id,
                profile_id,
                execution.selector,
                execution.target,
                execution.timeout_ms,
                execution.status,
                execution.replies_json,
                execution.duration_ms,
                execution.error,
                execution.timestamp,
            ],
        )?;
        Ok(())
    }

    /// Queries query execution history with pagination.
    pub fn get_query_history(
        &self,
        profile_id: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<StoredQueryExecution>> {
        let conn = self.conn.lock();
        let mut history = Vec::new();

        match profile_id {
            None => {
                let mut stmt = conn.prepare(
                    "SELECT id, profile_id, selector, target, timeout_ms, status, replies_json, duration_ms, error, timestamp
                     FROM query_history
                     ORDER BY timestamp DESC
                     LIMIT ?1 OFFSET ?2",
                )?;
                let rows = stmt.query_map(rusqlite::params![limit, offset], map_query_execution_row)?;
                for item in rows {
                    history.push(item?);
                }
            }
            Some(pid) if pid.trim().is_empty() || pid == "__all__" => {
                let mut stmt = conn.prepare(
                    "SELECT id, profile_id, selector, target, timeout_ms, status, replies_json, duration_ms, error, timestamp
                     FROM query_history
                     ORDER BY timestamp DESC
                     LIMIT ?1 OFFSET ?2",
                )?;
                let rows = stmt.query_map(rusqlite::params![limit, offset], map_query_execution_row)?;
                for item in rows {
                    history.push(item?);
                }
            }
            Some(pid) => {
                let mut stmt = conn.prepare(
                    "SELECT id, profile_id, selector, target, timeout_ms, status, replies_json, duration_ms, error, timestamp
                     FROM query_history
                     WHERE profile_id = ?1
                     ORDER BY timestamp DESC
                     LIMIT ?2 OFFSET ?3",
                )?;
                let rows = stmt.query_map(rusqlite::params![pid, limit, offset], map_query_execution_row)?;
                for item in rows {
                    history.push(item?);
                }
            }
        }

        Ok(history)
    }

    /// Clears query history for a profile or all profiles.
    pub fn clear_query_history(&self, profile_id: Option<&str>) -> Result<()> {
        let conn = self.conn.lock();
        match profile_id {
            Some(pid) if !pid.trim().is_empty() && pid != "__all__" => {
                conn.execute("DELETE FROM query_history WHERE profile_id = ?1", rusqlite::params![pid])?;
            }
            _ => {
                conn.execute("DELETE FROM query_history", [])?;
            }
        }
        Ok(())
    }

    /// Deletes a specific query execution record by ID.
    pub fn delete_query_execution_by_id(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM query_history WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}

/// Helper function to map a SQLite row to a `StoredMessage`.
fn map_message_row(row: &rusqlite::Row) -> rusqlite::Result<StoredMessage> {
    let profile_id: Option<String> = row.get(1)?;
    let source_id: Option<String> = row.get(8)?;
    Ok(StoredMessage {
        id: Some(row.get(0)?),
        profile_id: profile_id.unwrap_or_default(),
        direction: row.get(2)?,
        key_expr: row.get(3)?,
        payload: row.get(4)?,
        encoding: row.get(5)?,
        kind: row.get(6)?,
        timestamp: row.get(7)?,
        source_id,
    })
}

/// Helper function to map a SQLite row to a `SubscriptionPreset`.
fn map_preset_row(row: &rusqlite::Row) -> rusqlite::Result<SubscriptionPreset> {
    let auto_sub_int: i64 = row.get(4)?;
    Ok(SubscriptionPreset {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        key_expr: row.get(2)?,
        default_encoding: row.get(3)?,
        auto_subscribe: auto_sub_int != 0,
        color_tag: row.get(5)?,
    })
}

/// Helper function to map a SQLite row to a `QueryablePreset`.
fn map_queryable_preset_row(row: &rusqlite::Row) -> rusqlite::Result<QueryablePreset> {
    let auto_reply_int: i64 = row.get(3)?;
    Ok(QueryablePreset {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        key_expr: row.get(2)?,
        auto_reply: auto_reply_int != 0,
        reply_payload: row.get(4)?,
        reply_encoding: row.get(5)?,
    })
}

/// Helper function to map a SQLite row to a `StoredQueryExecution`.
fn map_query_execution_row(row: &rusqlite::Row) -> rusqlite::Result<StoredQueryExecution> {
    let profile_id: Option<String> = row.get(1)?;
    let duration_i64: Option<i64> = row.get(7)?;
    Ok(StoredQueryExecution {
        id: row.get(0)?,
        profile_id,
        selector: row.get(2)?,
        target: row.get(3)?,
        timeout_ms: row.get(4)?,
        status: row.get(5)?,
        replies_json: row.get(6)?,
        duration_ms: duration_i64.map(|d| d as u64),
        error: row.get(8)?,
        timestamp: row.get(9)?,
    })
}

/// Helper function to map a SQLite row to a `ConnectionProfile`.
fn map_profile_row(row: &rusqlite::Row) -> rusqlite::Result<ConnectionProfile> {
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
}
