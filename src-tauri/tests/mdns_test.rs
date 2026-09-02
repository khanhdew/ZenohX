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

//! Integration tests for ZenohX mDNS responder subsystem.
//! Verifies zero-configuration mDNS service publication, hostname resolution,
//! interface scanning, and runtime lifecycle control.

use zenohx_lib::mdns::MdnsManager;

#[tokio::test]
async fn test_mdns_responder_integration() {
    let mgr = MdnsManager::new("zenohx-test", 7447);

    // Initial start
    let start_res = mgr.start();
    assert!(start_res.is_ok(), "MdnsManager should start without error");

    // Inspect initial runtime status
    let status = mgr.get_status();
    assert!(status.enabled, "mDNS should be enabled");
    assert_eq!(
        status.active_hostname, "zenohx-test.local",
        "Active hostname should format as <hostname>.local"
    );
    assert_eq!(status.port, 7447, "Advertised port should match configured port");
    assert!(!status.addresses.is_empty(), "Bound addresses should not be empty");

    // Interface refresh
    let refresh_res = mgr.refresh_interfaces();
    assert!(refresh_res.is_ok(), "Refreshing network interfaces should succeed");
    let status_after_refresh = mgr.get_status();
    assert!(status_after_refresh.enabled);
    assert_eq!(status_after_refresh.active_hostname, "zenohx-test.local");

    // Config update: change hostname
    let update_res = mgr.set_config(true, "zenohx-renamed");
    assert!(update_res.is_ok(), "Updating mDNS config should succeed");
    let status_after_update = mgr.get_status();
    assert!(status_after_update.enabled);
    assert_eq!(status_after_update.active_hostname, "zenohx-renamed.local");
    assert_eq!(status_after_update.configured_hostname, "zenohx-renamed");

    // Config update: disable
    let disable_res = mgr.set_config(false, "zenohx-renamed");
    assert!(disable_res.is_ok(), "Disabling mDNS should succeed");
    let status_after_disable = mgr.get_status();
    assert!(!status_after_disable.enabled, "mDNS should now be disabled");

    // Re-enable
    let enable_res = mgr.set_config(true, "zenohx-final");
    assert!(enable_res.is_ok(), "Re-enabling mDNS should succeed");
    assert!(mgr.get_status().enabled);

    // Clean stop
    let stop_res = mgr.stop();
    assert!(stop_res.is_ok(), "MdnsManager should stop cleanly");
    assert!(!mgr.get_status().enabled, "mDNS should be stopped");
}
