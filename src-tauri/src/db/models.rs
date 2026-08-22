use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub mode: String, // "peer" | "client"
    pub connect_locators: Vec<String>,
    pub listen_locators: Vec<String>,
    pub scout_multicast: bool,
    pub user_auth: Option<serde_json::Value>,
    pub tls_config: Option<serde_json::Value>,
    pub custom_config: Option<serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubscriptionPreset {
    pub id: String,
    pub profile_id: String,
    pub key_expr: String,
    pub default_encoding: String,
    pub auto_subscribe: bool,
    pub color_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StoredMessage {
    pub id: Option<i64>,
    pub profile_id: String,
    pub direction: String, // "incoming" | "outgoing"
    pub key_expr: String,
    pub payload: Vec<u8>,
    pub encoding: String, // "json" | "cbor" | "text" | "raw"
    pub kind: String,     // "put" | "delete"
    pub timestamp: i64,
}
