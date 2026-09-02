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

use std::net::IpAddr;

/// Sanitizes a raw hostname into a valid mDNS hostname ending with `.local.`.
pub fn sanitize_hostname(name: &str) -> String {
    let mut cleaned = name.trim().to_lowercase();
    if cleaned.is_empty() {
        cleaned = "zenohx".to_string();
    }
    // Strip trailing or leading dots
    cleaned = cleaned.trim_matches('.').to_string();
    // Strip .local if user included it
    if let Some(stripped) = cleaned.strip_suffix(".local") {
        cleaned = stripped.trim_matches('.').to_string();
    }
    // Remove invalid DNS characters (only keep a-z, 0-9, '-')
    cleaned = cleaned
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    cleaned = cleaned.trim_matches('-').to_string();
    if cleaned.is_empty() {
        cleaned = "zenohx".to_string();
    }
    format!("{cleaned}.local.")
}

/// Formats a sanitized mDNS FQDN for user-facing display (e.g. "zenohx.local").
pub fn display_hostname(fqdn: &str) -> String {
    fqdn.trim_end_matches('.').to_string()
}

/// Collects all non-loopback local network interface IPv4 and IPv6 addresses.
pub fn collect_local_ip_addresses() -> Vec<IpAddr> {
    let mut ips = Vec::new();
    if let Ok(interfaces) = if_addrs::get_if_addrs() {
        for iface in interfaces {
            if !iface.is_loopback() {
                ips.push(iface.ip());
            }
        }
    }
    if ips.is_empty() {
        // Fallback to loopback if no LAN interfaces are active
        ips.push(IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1)));
    }
    ips
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_hostname() {
        assert_eq!(sanitize_hostname("zenohx"), "zenohx.local.");
        assert_eq!(sanitize_hostname("zenohx.local"), "zenohx.local.");
        assert_eq!(sanitize_hostname("ZenohX.local."), "zenohx.local.");
        assert_eq!(sanitize_hostname("my robot!"), "my-robot.local.");
        assert_eq!(sanitize_hostname("---my robot!---"), "my-robot.local.");
        assert_eq!(sanitize_hostname(""), "zenohx.local.");
        assert_eq!(sanitize_hostname("---"), "zenohx.local.");
    }

    #[test]
    fn test_display_hostname() {
        assert_eq!(display_hostname("zenohx.local."), "zenohx.local");
        assert_eq!(display_hostname("zenohx.local"), "zenohx.local");
    }

    #[test]
    fn test_collect_local_ip_addresses() {
        let ips = collect_local_ip_addresses();
        assert!(!ips.is_empty(), "Should return at least one IP address");
    }
}
