use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserAuth {
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TlsConfig {
    #[serde(default)]
    pub ca_cert: Option<String>,
    #[serde(default)]
    pub client_cert: Option<String>,
    #[serde(default)]
    pub client_key: Option<String>,
    #[serde(default)]
    pub tls_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReconnectRetryConfig {
    #[serde(default = "default_retry_init_ms")]
    pub period_init_ms: u64,
    #[serde(default = "default_retry_max_ms")]
    pub period_max_ms: u64,
    #[serde(default = "default_retry_factor")]
    pub factor: u8,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
}

fn default_retry_init_ms() -> u64 { 1000 }
fn default_retry_max_ms() -> u64 { 4000 }
fn default_retry_factor() -> u8 { 2 }
fn default_timeout_ms() -> u64 { 0 }
fn default_scout_gossip() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionConfig {
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub connect_locators: Vec<String>,
    #[serde(default)]
    pub listen_locators: Vec<String>,
    #[serde(default = "default_scout_multicast")]
    pub scout_multicast: bool,
    #[serde(default = "default_scout_gossip")]
    pub scout_gossip: bool,
    #[serde(default)]
    pub reconnect_retry: Option<ReconnectRetryConfig>,
    #[serde(default)]
    pub user_auth: Option<UserAuth>,
    #[serde(default)]
    pub tls_config: Option<TlsConfig>,
    #[serde(default)]
    pub custom_config: Option<serde_json::Value>,
}

fn default_mode() -> String {
    "peer".to_string()
}

fn default_scout_multicast() -> bool {
    true
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self::default_peer()
    }
}

impl SessionConfig {
    pub fn default_peer() -> Self {
        Self {
            profile_id: None,
            mode: "peer".to_string(),
            connect_locators: vec![],
            listen_locators: vec![],
            scout_multicast: true,
            scout_gossip: true,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        }
    }

    pub fn default_client() -> Self {
        Self {
            profile_id: None,
            mode: "client".to_string(),
            connect_locators: vec![],
            listen_locators: vec![],
            scout_multicast: false,
            scout_gossip: false,
            reconnect_retry: None,
            user_auth: None,
            tls_config: None,
            custom_config: None,
        }
    }
}

fn normalize_locator(loc: &str) -> String {
    let loc = loc.trim();
    if loc.is_empty() {
        return String::new();
    }
    if let Some((proto, addr)) = loc.split_once('/') {
        let proto_lower = proto.to_lowercase();
        if proto_lower == "unixpipe" || proto_lower == "unix" {
            return loc.to_string();
        }
        if !addr.starts_with('[') && addr.matches(':').count() > 1 {
            // Unbracketed IPv6: e.g. "tcp/::1:7447", "tcp/2001:db8::1:7447", "tcp/::"
            if let Some(last_colon) = addr.rfind(':') {
                let last_seg = &addr[last_colon + 1..];
                if last_seg.chars().all(|c| c.is_ascii_digit()) && !last_seg.is_empty() {
                    let ip = &addr[..last_colon];
                    return format!("{proto}/[{ip}]:{last_seg}");
                }
            }
            return format!("{proto}/[{addr}]:7447");
        }
    }
    loc.to_string()
}

impl SessionConfig {
    /// Converts the `SessionConfig` into a native `zenoh::Config`.
    pub fn to_zenoh_config(&self) -> Result<zenoh::Config, String> {
        let mut config = zenoh::Config::default();

        // 0. Persistent Node ID (ZID)
        // Derive a valid hexadecimal Zenoh ID (without syntax-breaking leading zero formatting)
        if let Some(pid) = &self.profile_id {
            let zid_hex = if let Ok(u) = uuid::Uuid::parse_str(pid) {
                format!("{:x}", u.as_u128())
            } else {
                let u = uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, pid.as_bytes());
                format!("{:x}", u.as_u128())
            };
            let _ = config.insert_json5("id", &format!("\"{zid_hex}\""));
        }

        // 1. Mode configuration ("peer", "client", "router")
        let mode_str = self.mode.to_lowercase();
        match mode_str.as_str() {
            "peer" | "client" | "router" => {
                config
                    .insert_json5("mode", &format!("\"{mode_str}\""))
                    .map_err(|e| format!("failed to set mode '{mode_str}': {e}"))?;
            }
            other => {
                return Err(format!(
                    "unknown zenoh mode: '{other}'. Expected 'peer', 'client', or 'router'"
                ));
            }
        }

        // 2. Connect locators & background retry policy
        if !self.connect_locators.is_empty() {
            let normalized_connect: Vec<String> = self
                .connect_locators
                .iter()
                .map(|l| normalize_locator(l))
                .filter(|l| !l.is_empty())
                .collect();
            let json = serde_json::to_string(&normalized_connect)
                .map_err(|e| format!("failed to serialize connect_locators: {e}"))?;
            config
                .insert_json5("connect/endpoints", &json)
                .map_err(|e| format!("failed to set connect endpoints: {e}"))?;

            let (timeout_ms, period_init, period_max, factor) = if let Some(r) = &self.reconnect_retry {
                (r.timeout_ms, r.period_init_ms, r.period_max_ms, r.factor)
            } else {
                (0, 1000, 4000, 2)
            };

            let _ = config.insert_json5("connect/timeout_ms", &timeout_ms.to_string());
            let _ = config.insert_json5("connect/exit_on_failure", "false");
            let _ = config.insert_json5("connect/retry/period_init_ms", &period_init.to_string());
            let _ = config.insert_json5("connect/retry/period_max_ms", &period_max.to_string());
            let _ = config.insert_json5("connect/retry/period_increase_factor", &factor.to_string());
        }

        // 3. Listen locators
        // For Unix domain socket endpoints (e.g. "unixpipe//tmp/zenoh.sock"), clean up stale socket files
        for loc in &self.listen_locators {
            if let Some(path) = loc.strip_prefix("unixpipe/") {
                let direct_path = std::path::Path::new(path);
                if direct_path.exists() {
                    let _ = std::fs::remove_file(direct_path);
                } else {
                    let clean_path = path.trim_start_matches('/');
                    let full_path = format!("/{clean_path}");
                    let alt_path = std::path::Path::new(&full_path);
                    if alt_path.exists() {
                        let _ = std::fs::remove_file(alt_path);
                    }
                }
            }
        }

        if !self.listen_locators.is_empty() {
            let normalized_listen: Vec<String> = self
                .listen_locators
                .iter()
                .map(|l| normalize_locator(l))
                .filter(|l| !l.is_empty())
                .collect();
            let json = serde_json::to_string(&normalized_listen)
                .map_err(|e| format!("failed to serialize listen_locators: {e}"))?;
            config
                .insert_json5("listen/endpoints", &json)
                .map_err(|e| format!("failed to set listen endpoints: {e}"))?;
        } else if self.tls_config.is_some() && mode_str == "peer" {
            // When TLS is configured on a peer without explicit listen locator, listen on dynamic port
            let default_tls_listen = vec!["tls/0.0.0.0:0".to_string()];
            let json = serde_json::to_string(&default_tls_listen)
                .map_err(|e| format!("failed to serialize listen_locators: {e}"))?;
            config
                .insert_json5("listen/endpoints", &json)
                .map_err(|e| format!("failed to set tls listen endpoints: {e}"))?;
        }

        // 4. Multicast & Gossip scouting
        config
            .insert_json5(
                "scouting/multicast/enabled",
                if self.scout_multicast { "true" } else { "false" },
            )
            .map_err(|e| format!("failed to configure multicast scout: {e}"))?;

        let _ = config.insert_json5(
            "scouting/gossip/enabled",
            if self.scout_gossip { "true" } else { "false" },
        );

        // 5. User Authentication
        if let Some(auth) = &self.user_auth {
            if let Some(user) = &auth.username {
                config
                    .insert_json5("transport/auth/usrpwd/user", &format!("\"{user}\""))
                    .map_err(|e| format!("failed to set auth user: {e}"))?;
            }
            if let Some(pass) = &auth.password {
                config
                    .insert_json5("transport/auth/usrpwd/password", &format!("\"{pass}\""))
                    .map_err(|e| format!("failed to set auth password: {e}"))?;
            } else if let Some(token) = &auth.token {
                if auth.username.is_none() {
                    config
                        .insert_json5("transport/auth/usrpwd/user", "\"token\"")
                        .map_err(|e| format!("failed to set auth user for token: {e}"))?;
                }
                config
                    .insert_json5("transport/auth/usrpwd/password", &format!("\"{token}\""))
                    .map_err(|e| format!("failed to set auth token: {e}"))?;
            }
        }

        // 6. TLS & mTLS configuration
        if let Some(tls) = &self.tls_config {
            if let Some(ca) = &tls.ca_cert {
                if !ca.trim().is_empty() {
                    config
                        .insert_json5("transport/link/tls/root_ca_certificate", &format!("\"{ca}\""))
                        .map_err(|e| format!("failed to set tls ca cert: {e}"))?;
                }
            }
            if let Some(cert) = &tls.client_cert {
                if !cert.trim().is_empty() {
                    config
                        .insert_json5("transport/link/tls/connect_certificate", &format!("\"{cert}\""))
                        .map_err(|e| format!("failed to set tls connect cert: {e}"))?;
                    config
                        .insert_json5("transport/link/tls/listen_certificate", &format!("\"{cert}\""))
                        .map_err(|e| format!("failed to set tls listen cert: {e}"))?;
                }
            }
            if let Some(key) = &tls.client_key {
                if !key.trim().is_empty() {
                    config
                        .insert_json5("transport/link/tls/connect_private_key", &format!("\"{key}\""))
                        .map_err(|e| format!("failed to set tls connect key: {e}"))?;
                    config
                        .insert_json5("transport/link/tls/listen_private_key", &format!("\"{key}\""))
                        .map_err(|e| format!("failed to set tls listen key: {e}"))?;
                }
            }

            let has_client_auth = tls.client_cert.as_ref().map_or(false, |c| !c.trim().is_empty())
                && tls.client_key.as_ref().map_or(false, |k| !k.trim().is_empty());
            if has_client_auth {
                let _ = config.insert_json5("transport/link/tls/enable_mtls", "true");
            }
            let _ = config.insert_json5("transport/link/tls/verify_name_on_connect", "false");

            if tls.tls_only.unwrap_or(false) {
                config
                    .insert_json5("transport/link/protocols", "[\"tls\"]")
                    .map_err(|e| format!("failed to set tls-only protocols: {e}"))?;
            }
        }

        // 7. Custom JSON5 config overrides
        if let Some(custom) = &self.custom_config {
            if let Some(obj) = custom.as_object() {
                for (k, v) in obj {
                    if k == "id" {
                        if let Some(s) = v.as_str() {
                            let clean_id = s.replace('-', "").to_lowercase();
                            if !clean_id.is_empty() && clean_id.chars().all(|c| c.is_ascii_hexdigit()) {
                                let _ = config.insert_json5("id", &format!("\"{clean_id}\""));
                            }
                        }
                        continue;
                    }
                    let json_val = serde_json::to_string(v)
                        .map_err(|e| format!("failed to serialize custom config value: {e}"))?;
                    config
                        .insert_json5(k, &json_val)
                        .map_err(|e| format!("failed to insert custom config '{k}': {e}"))?;
                }
            } else {
                return Err(
                    "custom_config must be a JSON object of key-value overrides".to_string(),
                );
            }
        }

        Ok(config)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScoutedNode {
    pub zid: String,
    pub what: String,
    pub locators: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionLinkInfo {
    pub zid: String,
    pub whatami: String, // "router", "peer", "client"
    pub src: String,
    pub dst: String,
    pub is_streamed: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mtu: Option<u16>,
    #[serde(default)]
    pub interfaces: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub auth_identifier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reliability: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priorities: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionInfo {
    pub id: uuid::Uuid,
    pub profile_id: Option<String>,
    pub zid: String,
    pub mode: String,
    pub scout_multicast: bool,
    #[serde(default = "default_scout_gossip")]
    pub scout_gossip: bool,
    pub connect_locators: Vec<String>,
    pub listen_locators: Vec<String>,
    #[serde(default)]
    pub bound_locators: Vec<String>,
    pub created_at: i64,
    #[serde(default)]
    pub connected_routers: Vec<String>,
    #[serde(default)]
    pub connected_peers: Vec<String>,
    #[serde(default)]
    pub links: Vec<SessionLinkInfo>,
    #[serde(default)]
    pub active_subscribers: usize,
    #[serde(default)]
    pub active_queryables: usize,
    #[serde(default)]
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PublishOptions {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub congestion_control: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub express: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub attachment: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct SubscribeOptions {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub allowed_origin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StreamGeneratorConfig {
    pub session_id: uuid::Uuid,
    pub generator_id: uuid::Uuid,
    pub key_expr: String,
    pub encoding: String,
    pub rate_hz: u32,
    pub payload_template: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub congestion_control: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub total_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ZenohSample {
    pub session_id: uuid::Uuid,
    pub sub_id: Option<uuid::Uuid>,
    pub key_expr: String,
    pub payload: Vec<u8>,
    pub encoding: String,
    pub kind: String, // "put" | "delete"
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub express: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub attachment: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReplySample {
    pub session_id: uuid::Uuid,
    pub key_expr: String,
    pub payload: Vec<u8>,
    pub encoding: String,
    pub replier_id: Option<String>,
    pub latency_ms: u64,
    pub timestamp: i64,
    pub is_err: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InboundQuery {
    pub token: uuid::Uuid,
    pub session_id: uuid::Uuid,
    pub queryable_id: uuid::Uuid,
    pub key_expr: String,
    pub parameters: String,
    pub payload: Option<Vec<u8>>,
    pub encoding: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct QueryableInfo {
    pub id: uuid::Uuid,
    pub session_id: uuid::Uuid,
    pub key_expr: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusEvent {
    pub session_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
}


