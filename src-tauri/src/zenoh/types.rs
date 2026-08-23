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
}

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
            user_auth: None,
            tls_config: None,
            custom_config: None,
        }
    }

    /// Converts the `SessionConfig` into a native `zenoh::Config`.
    pub fn to_zenoh_config(&self) -> Result<zenoh::Config, String> {
        let mut config = zenoh::Config::default();

        // 0. Persistent Node ID (ZID)
        // If profile_id is provided, derive a deterministic 128-bit hex Zenoh ID so this profile always uses the exact same node ID
        if let Some(pid) = &self.profile_id {
            let zid_hex = if let Ok(u) = uuid::Uuid::parse_str(pid) {
                format!("{:032x}", u.as_u128())
            } else {
                let u = uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, pid.as_bytes());
                format!("{:032x}", u.as_u128())
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

        // 2. Connect locators
        if !self.connect_locators.is_empty() {
            let json = serde_json::to_string(&self.connect_locators)
                .map_err(|e| format!("failed to serialize connect_locators: {e}"))?;
            config
                .insert_json5("connect/endpoints", &json)
                .map_err(|e| format!("failed to set connect endpoints: {e}"))?;
        }

        // 3. Listen locators
        if !self.listen_locators.is_empty() {
            let json = serde_json::to_string(&self.listen_locators)
                .map_err(|e| format!("failed to serialize listen_locators: {e}"))?;
            config
                .insert_json5("listen/endpoints", &json)
                .map_err(|e| format!("failed to set listen endpoints: {e}"))?;
        } else if self.tls_config.is_some() && mode_str == "peer" {
            // When TLS is configured on a peer without explicit listen locator, listen on TLS
            let default_tls_listen = vec!["tls/0.0.0.0:7447".to_string()];
            let json = serde_json::to_string(&default_tls_listen)
                .map_err(|e| format!("failed to serialize listen_locators: {e}"))?;
            config
                .insert_json5("listen/endpoints", &json)
                .map_err(|e| format!("failed to set tls listen endpoints: {e}"))?;
        }

        // 4. Multicast scouting
        config
            .insert_json5(
                "scouting/multicast/enabled",
                if self.scout_multicast { "true" } else { "false" },
            )
            .map_err(|e| format!("failed to configure multicast scout: {e}"))?;

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

            if tls.client_cert.is_some() || tls.client_key.is_some() || tls.ca_cert.is_some() {
                let _ = config.insert_json5("transport/link/tls/enable_mtls", "true");
                let _ = config.insert_json5("transport/link/tls/verify_name_on_connect", "false");
            }
        }

        // 7. Custom JSON5 config overrides
        if let Some(custom) = &self.custom_config {
            if let Some(obj) = custom.as_object() {
                for (k, v) in obj {
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
pub struct SessionInfo {
    pub id: uuid::Uuid,
    pub profile_id: Option<String>,
    pub zid: String,
    pub mode: String,
    pub scout_multicast: bool,
    pub connect_locators: Vec<String>,
    pub listen_locators: Vec<String>,
    pub created_at: i64,
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


