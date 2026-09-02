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

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub mode: String, // "peer" | "client" | "router"
    pub connect_locators: Vec<String>,
    pub listen_locators: Vec<String>,
    pub scout_multicast: bool,
    pub user_auth: Option<serde_json::Value>,
    pub tls_config: Option<serde_json::Value>,
    pub custom_config: Option<serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn validate_locator_str(loc: &str) -> Result<(), String> {
    let loc = loc.trim();
    if loc.is_empty() {
        return Err("Locator cannot be empty".to_string());
    }
    if let Some((proto, rest)) = loc.split_once('/') {
        let proto_lower = proto.to_lowercase();
        let valid_protos = ["tcp", "tls", "quic", "udp", "ws", "wss", "unix", "unixpipe"];
        if !valid_protos.contains(&proto_lower.as_str()) {
            return Err(format!("Unsupported transport protocol '{proto}' in locator '{loc}'. Supported: tcp, tls, quic, udp, ws, wss, unix."));
        }
        if proto_lower == "unix" || proto_lower == "unixpipe" {
            if !rest.starts_with('/') && !loc.starts_with("unixpipe//") {
                return Err(format!("Unix socket path must start with '/' in locator '{loc}'"));
            }
            return Ok(());
        }
        if rest.trim().is_empty() {
            return Err(format!("Host and port cannot be empty in locator '{loc}'"));
        }
    } else {
        return Err(format!("Invalid Zenoh locator format '{loc}'. Expected 'protocol/host:port'"));
    }
    Ok(())
}

impl ConnectionProfile {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("Profile ID cannot be empty".to_string());
        }
        if self.name.trim().is_empty() {
            return Err("Profile name cannot be empty".to_string());
        }
        let mode_lower = self.mode.trim().to_lowercase();
        if mode_lower != "client" && mode_lower != "peer" && mode_lower != "router" {
            return Err(format!(
                "Invalid connection mode '{}'. Expected 'client', 'peer', or 'router'",
                self.mode
            ));
        }
        for loc in &self.connect_locators {
            validate_locator_str(loc)?;
        }
        for loc in &self.listen_locators {
            validate_locator_str(loc)?;
        }
        Ok(())
    }
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
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QueryablePreset {
    pub id: String,
    pub profile_id: String,
    pub key_expr: String,
    pub auto_reply: bool,
    pub reply_payload: Option<String>,
    pub reply_encoding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StoredQueryExecution {
    pub id: String,
    pub profile_id: Option<String>,
    pub selector: String,
    pub target: String,
    pub timeout_ms: u64,
    pub status: String,
    pub replies_json: String,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
    pub timestamp: i64,
}
