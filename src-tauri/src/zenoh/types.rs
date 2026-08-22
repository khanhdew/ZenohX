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
            }
        }

        // 6. TLS configuration
        if let Some(tls) = &self.tls_config {
            if let Some(ca) = &tls.ca_cert {
                config
                    .insert_json5("transport/link/tls/root_ca_certificate", &format!("\"{ca}\""))
                    .map_err(|e| format!("failed to set tls ca cert: {e}"))?;
            }
            if let Some(cert) = &tls.client_cert {
                config
                    .insert_json5("transport/link/tls/certificate", &format!("\"{cert}\""))
                    .map_err(|e| format!("failed to set tls cert: {e}"))?;
            }
            if let Some(key) = &tls.client_key {
                config
                    .insert_json5("transport/link/tls/private_key", &format!("\"{key}\""))
                    .map_err(|e| format!("failed to set tls key: {e}"))?;
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
