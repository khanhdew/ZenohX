use super::types::ScoutedNode;
use std::time::Duration;
use tokio::time::timeout;
use zenoh::config::WhatAmI;

/// Performs multicast scouting on the local network for Zenoh nodes (routers and peers).
///
/// Returns a list of discovered nodes within the specified timeout.
pub async fn scout_nodes(timeout_ms: u64) -> Result<Vec<ScoutedNode>, String> {
    let mut config = zenoh::Config::default();
    config
        .insert_json5("scouting/multicast/enabled", "true")
        .map_err(|e| format!("failed to enable multicast scouting: {e}"))?;

    let receiver = zenoh::scout(WhatAmI::Router | WhatAmI::Peer, config)
        .await
        .map_err(|e| format!("failed to start zenoh scout: {e}"))?;

    let mut nodes = Vec::new();
    let duration = Duration::from_millis(timeout_ms);

    let _ = timeout(duration, async {
        while let Ok(hello) = receiver.recv_async().await {
            let zid = hello.zid().to_string();
            let what = format!("{:?}", hello.whatami());
            let locators = hello
                .locators()
                .iter()
                .map(|loc| loc.to_string())
                .collect::<Vec<String>>();

            // Avoid duplicate entries if same node replies multiple times
            if let Some(existing) = nodes.iter_mut().find(|n: &&mut ScoutedNode| n.zid == zid) {
                for loc in locators {
                    if !existing.locators.contains(&loc) {
                        existing.locators.push(loc);
                    }
                }
            } else {
                nodes.push(ScoutedNode {
                    zid,
                    what,
                    locators,
                });
            }
        }
    })
    .await;

    Ok(nodes)
}
