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

use super::types::MdnsStatus;
use super::utils::{collect_local_ip_addresses, display_hostname, sanitize_hostname};
use mdns_sd::{ServiceDaemon, ServiceInfo};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

const ZENOH_SERVICE_TYPE: &str = "_zenoh._tcp.local.";
const DEFAULT_MDNS_PORT: u16 = 7447;

struct InnerMdnsState {
    enabled: bool,
    configured_hostname: String,
    active_hostname: String,
    port: u16,
    daemon: Option<ServiceDaemon>,
    service_fullname: Option<String>,
}

#[derive(Clone)]
pub struct MdnsManager {
    state: Arc<RwLock<InnerMdnsState>>,
}

impl Default for MdnsManager {
    fn default() -> Self {
        Self::new("zenohx", DEFAULT_MDNS_PORT)
    }
}

impl MdnsManager {
    pub fn new(configured_hostname: &str, port: u16) -> Self {
        let clean_cfg = display_hostname(configured_hostname);
        let active = display_hostname(&sanitize_hostname(&clean_cfg));
        Self {
            state: Arc::new(RwLock::new(InnerMdnsState {
                enabled: true,
                configured_hostname: clean_cfg,
                active_hostname: active,
                port,
                daemon: None,
                service_fullname: None,
            })),
        }
    }

    /// Starts or registers the mDNS service advertisement.
    pub fn start(&self) -> Result<MdnsStatus, String> {
        let mut state = self.state.write();
        state.enabled = true;
        self.register_service_locked(&mut state)?;
        Ok(self.build_status_locked(&state))
    }

    /// Stops the mDNS service advertisement.
    pub fn stop(&self) -> Result<MdnsStatus, String> {
        let mut state = self.state.write();
        state.enabled = false;
        if let Some(daemon) = state.daemon.take() {
            if let Some(fullname) = state.service_fullname.take() {
                let _ = daemon.unregister(&fullname);
            }
            let _ = daemon.shutdown();
        }
        Ok(self.build_status_locked(&state))
    }

    /// Updates mDNS enabled state and/or configured hostname.
    pub fn set_config(&self, enabled: bool, hostname: &str) -> Result<MdnsStatus, String> {
        let mut state = self.state.write();
        let clean_cfg = display_hostname(hostname);
        state.configured_hostname = clean_cfg.clone();
        state.active_hostname = display_hostname(&sanitize_hostname(&clean_cfg));
        state.enabled = enabled;

        if enabled {
            self.register_service_locked(&mut state)?;
        } else if let Some(daemon) = state.daemon.take() {
            if let Some(fullname) = state.service_fullname.take() {
                let _ = daemon.unregister(&fullname);
            }
            let _ = daemon.shutdown();
        }

        Ok(self.build_status_locked(&state))
    }

    /// Updates the advertised port dynamically (e.g. when router session binds to a custom port).
    pub fn update_port(&self, port: u16) -> Result<MdnsStatus, String> {
        let mut state = self.state.write();
        state.port = port;
        if state.enabled {
            self.register_service_locked(&mut state)?;
        }
        Ok(self.build_status_locked(&state))
    }

    /// Refreshes network interfaces and re-registers the mDNS responder.
    pub fn refresh_interfaces(&self) -> Result<MdnsStatus, String> {
        let mut state = self.state.write();
        if state.enabled {
            self.register_service_locked(&mut state)?;
        }
        Ok(self.build_status_locked(&state))
    }

    /// Retrieves the current mDNS runtime status.
    pub fn get_status(&self) -> MdnsStatus {
        let state = self.state.read();
        self.build_status_locked(&state)
    }

    fn register_service_locked(&self, state: &mut InnerMdnsState) -> Result<(), String> {
        // Unregister previous service if any
        if let Some(daemon) = &state.daemon {
            if let Some(fullname) = state.service_fullname.take() {
                let _ = daemon.unregister(&fullname);
            }
        }

        let daemon = match &state.daemon {
            Some(d) => d.clone(),
            None => {
                let d = ServiceDaemon::new().map_err(|e| format!("Failed to start mDNS daemon: {e}"))?;
                state.daemon = Some(d.clone());
                d
            }
        };

        let fqdn_hostname = sanitize_hostname(&state.configured_hostname);
        let instance_name = format!("ZenohX ({})", display_hostname(&fqdn_hostname));
        let local_ips = collect_local_ip_addresses();

        let properties: HashMap<String, String> = [
            ("app".to_string(), "zenohx".to_string()),
            ("version".to_string(), env!("CARGO_PKG_VERSION").to_string()),
        ]
        .into_iter()
        .collect();

        let service_info = ServiceInfo::new(
            ZENOH_SERVICE_TYPE,
            &instance_name,
            &fqdn_hostname,
            &local_ips[..],
            state.port,
            properties,
        )
        .map_err(|e| format!("Failed to build mDNS service info: {e}"))?;

        let fullname = service_info.get_fullname().to_string();
        daemon
            .register(service_info)
            .map_err(|e| format!("Failed to register mDNS service: {e}"))?;

        state.service_fullname = Some(fullname);
        state.active_hostname = display_hostname(&fqdn_hostname);

        Ok(())
    }

    fn build_status_locked(&self, state: &InnerMdnsState) -> MdnsStatus {
        let ips = collect_local_ip_addresses()
            .into_iter()
            .map(|ip| ip.to_string())
            .collect();

        MdnsStatus {
            enabled: state.enabled && state.daemon.is_some(),
            active_hostname: state.active_hostname.clone(),
            configured_hostname: state.configured_hostname.clone(),
            port: state.port,
            addresses: ips,
            is_conflict: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mdns_manager_lifecycle() {
        let mgr = MdnsManager::new("zenohx", 7447);
        let status = mgr.get_status();
        assert_eq!(status.configured_hostname, "zenohx");
        assert_eq!(status.active_hostname, "zenohx.local");
        assert_eq!(status.port, 7447);
        assert!(!status.enabled);

        let started = mgr.start();
        assert!(started.is_ok(), "MdnsManager start should succeed: {:?}", started.err());
        assert!(mgr.get_status().enabled);

        let updated = mgr.set_config(true, "custom-node");
        assert!(updated.is_ok());
        let status_after_update = mgr.get_status();
        assert_eq!(status_after_update.configured_hostname, "custom-node");
        assert_eq!(status_after_update.active_hostname, "custom-node.local");

        let port_updated = mgr.update_port(7448);
        assert!(port_updated.is_ok());
        assert_eq!(mgr.get_status().port, 7448);

        let refreshed = mgr.refresh_interfaces();
        assert!(refreshed.is_ok());

        let stopped = mgr.stop();
        assert!(stopped.is_ok());
        assert!(!mgr.get_status().enabled);
    }

    #[test]
    fn test_mdns_manager_disabled_config() {
        let mgr = MdnsManager::new("node-1", 7447);
        let _ = mgr.start().unwrap();
        assert!(mgr.get_status().enabled);

        let disabled = mgr.set_config(false, "node-2");
        assert!(disabled.is_ok());
        let status = mgr.get_status();
        assert!(!status.enabled);
        assert_eq!(status.configured_hostname, "node-2");
        assert_eq!(status.active_hostname, "node-2.local");
    }
}
