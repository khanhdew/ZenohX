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

use crate::mdns::MdnsStatus;
use crate::AppState;
use tauri::State;

/// Retrieves current mDNS responder runtime status, active hostname, and bound addresses.
#[tauri::command]
pub async fn get_mdns_status(state: State<'_, AppState>) -> Result<MdnsStatus, String> {
    Ok(state.mdns_manager.get_status())
}

/// Updates mDNS responder configuration (enabled/disabled state and advertised hostname).
#[tauri::command]
pub async fn set_mdns_config(
    state: State<'_, AppState>,
    enabled: bool,
    hostname: String,
) -> Result<MdnsStatus, String> {
    state.mdns_manager.set_config(enabled, &hostname)
}

/// Forces a scan of local network interfaces and re-registers the mDNS responder.
#[tauri::command]
pub async fn refresh_mdns_interfaces(state: State<'_, AppState>) -> Result<MdnsStatus, String> {
    state.mdns_manager.refresh_interfaces()
}
