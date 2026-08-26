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

use rusqlite::{Connection, Result};

pub const CREATE_TABLES_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS connection_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'peer',
    connect_locators TEXT NOT NULL,
    listen_locators TEXT,
    scout_multicast INTEGER NOT NULL DEFAULT 1,
    user_auth TEXT,
    tls_config TEXT,
    custom_config TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_presets (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    key_expr TEXT NOT NULL,
    default_encoding TEXT NOT NULL DEFAULT 'json',
    auto_subscribe INTEGER NOT NULL DEFAULT 1,
    color_tag TEXT,
    FOREIGN KEY(profile_id) REFERENCES connection_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT,
    direction TEXT NOT NULL,
    key_expr TEXT NOT NULL,
    payload BLOB NOT NULL,
    encoding TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'put',
    timestamp INTEGER NOT NULL,
    source_id TEXT,
    FOREIGN KEY(profile_id) REFERENCES connection_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_msg_profile_ts ON message_history(profile_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_msg_ts ON message_history(timestamp DESC);

CREATE TABLE IF NOT EXISTS queryable_presets (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    key_expr TEXT NOT NULL,
    auto_reply INTEGER NOT NULL DEFAULT 0,
    reply_payload TEXT,
    reply_encoding TEXT NOT NULL DEFAULT 'json',
    FOREIGN KEY(profile_id) REFERENCES connection_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS query_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    selector TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT 'all',
    timeout_ms INTEGER NOT NULL DEFAULT 2000,
    status TEXT NOT NULL,
    replies_json TEXT NOT NULL DEFAULT '[]',
    duration_ms INTEGER,
    error TEXT,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(profile_id) REFERENCES connection_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_query_profile_ts ON query_history(profile_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_query_ts ON query_history(timestamp DESC);
"#;

pub fn initialize_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(CREATE_TABLES_SQL)?;
    // Run safe migration for existing SQLite databases
    let _ = conn.execute("ALTER TABLE message_history ADD COLUMN source_id TEXT;", []);
    Ok(())
}
