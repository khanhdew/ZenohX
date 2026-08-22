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
    profile_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    key_expr TEXT NOT NULL,
    payload BLOB NOT NULL,
    encoding TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'put',
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(profile_id) REFERENCES connection_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_msg_profile_ts ON message_history(profile_id, timestamp DESC);
"#;

pub fn initialize_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(CREATE_TABLES_SQL)?;
    Ok(())
}
