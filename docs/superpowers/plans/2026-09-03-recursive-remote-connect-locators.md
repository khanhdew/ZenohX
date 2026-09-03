# Recursive Sub-Node Discovery & Remote Connect Locators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable recursive Zenoh admin space discovery of multi-hop sub-nodes across the mesh and display remote connect locators on topology nodes, edges, and the Inspector panel.

**Architecture:** A native Rust BFS engine in `src-tauri/src/zenoh/manager.rs` queries `@/**` and unvisited `@/<sub_zid>/**` wave-by-wave up to `max_depth: 3`. The frontend parser extracts listen locators, connect locators, and links; the topology builder creates graph nodes and edges for all sub-nodes; and the Topology Inspector displays the remote connect locators.

**Tech Stack:** Rust (`tokio`, `zenoh 1.10`, `tauri 2.0`), TypeScript, React, Zustand, Node.js `node:test` test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-recursive-remote-connect-locators-design.md`

## Global Constraints
- Target Zenoh version: `1.10.0` with `unstable` feature.
- Bounded BFS crawl: Maximum default depth = 3 hops to prevent network query storms.
- Cycle Prevention: All visited ZIDs tracked in a `HashSet<String>`.
- Preserved Code Integrity: Do not break existing local session management, config generation, or traffic visualization.

---

### Task 1: Rust Backend Discovery Engine & Connect Locator Extraction

**Files:**
- Modify: `src-tauri/src/zenoh/manager.rs:860-910`
- Modify: `src-tauri/src/zenoh/manager.rs:918-1015`
- Modify: `src-tauri/src/commands/session_commands.rs:130-145`
- Modify: `src-tauri/src/lib.rs:100-110`
- Test: `src-tauri/src/zenoh/tests.rs`

**Interfaces:**
- Consumes: `SessionManager::query_admin_space(&session_id, selector, timeout_ms)`
- Produces:
  - `SessionManager::discover_admin_topology(&session_id, max_depth, timeout_ms) -> Result<Vec<AdminSpaceEntry>, String>`
  - Tauri command `discover_admin_topology(session_id, max_depth, timeout_ms)`
  - `NodeConfigurationResult.connect_locators` containing extracted remote connect addresses

- [ ] **Step 1: Write backend unit tests for remote connect locators and recursive discovery**

In `src-tauri/src/zenoh/tests.rs`, add tests:
```rust
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_remote_node_configuration_extracts_connect_locators() {
    // Tests that get_node_configuration accurately populates connect_locators
    // when admin entries include link dst locators or config connect endpoints.
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_discover_admin_topology_bounds_depth() {
    // Tests that discover_admin_topology executes with max_depth limit and tracks visited ZIDs.
}
```

- [ ] **Step 2: Run backend test to verify it fails**

Run: `cargo test test_remote_node_configuration_extracts_connect_locators --manifest-path src-tauri/Cargo.toml`
Expected: FAIL (method or fields not implemented yet)

- [ ] **Step 3: Implement `discover_admin_topology` and remote `connect_locators` extraction in `manager.rs`**

In `src-tauri/src/zenoh/manager.rs`:
1. In `get_node_configuration`:
   Extract connect locators from `remote_admin_entries`:
   ```rust
   let mut remote_connect_locs = Vec::new();
   for entry in &remote_admin_entries {
       if entry.key_expr.contains("/session/link") {
           if let Ok(v) = serde_json::from_str::<serde_json::Value>(&entry.payload_json) {
               if let Some(dst) = v.get("dst").and_then(|v| v.as_str()) {
                   if !dst.is_empty() && !dst.contains("127.0.0.1") && !dst.ends_with(":0") {
                       remote_connect_locs.push(dst.to_string());
                   }
               }
           }
       } else if entry.key_expr.contains("/config") {
           if let Ok(v) = serde_json::from_str::<serde_json::Value>(&entry.payload_json) {
               if let Some(endpoints) = v.get("connect").and_then(|c| c.get("endpoints")).and_then(|e| e.as_array()) {
                   for ep in endpoints {
                       if let Some(s) = ep.as_str() {
                           if !s.is_empty() && !s.contains("127.0.0.1") {
                               remote_connect_locs.push(s.to_string());
                           }
                       }
                   }
               }
           }
       }
   }
   remote_connect_locs.sort();
   remote_connect_locs.dedup();
   ```
   Set `connect_locators: remote_connect_locs` in `NodeConfigurationResult`.

2. Add `discover_admin_topology`:
   ```rust
   pub async fn discover_admin_topology(
       &self,
       session_id: &Uuid,
       max_depth: usize,
       timeout_ms: u64,
   ) -> Result<Vec<AdminSpaceEntry>, String> {
       let mut all_entries = Vec::new();
       let mut visited_zids = std::collections::HashSet::new();
       let mut key_set = std::collections::HashSet::new();

       // 1. Root query @/**
       let root_entries = self.query_admin_space(session_id, Some("@/**"), timeout_ms).await?;
       let mut next_wave_zids = Vec::new();

       for entry in root_entries {
           if let Some(ref zid) = entry.zid {
               visited_zids.insert(zid.to_lowercase());
           }
           // Extract neighbor/sub-node ZIDs from entry
           if entry.key_expr.contains("/router/") {
               let parts: Vec<&str> = entry.key_expr.split('/').collect();
               if let Some(idx) = parts.iter().position(|&p| p == "router") {
                   if idx + 1 < parts.len() {
                       next_wave_zids.push(parts[idx + 1].to_lowercase());
                   }
               }
           }
           if key_set.insert(entry.key_expr.clone()) {
               all_entries.push(entry);
           }
       }

       // 2. Iterative BFS waves up to max_depth
       let mut current_depth = 1;
       while current_depth < max_depth && !next_wave_zids.is_empty() {
           let wave = std::mem::take(&mut next_wave_zids);
           let unvisited: Vec<String> = wave
               .into_iter()
               .filter(|z| visited_zids.insert(z.clone()))
               .collect();

           if unvisited.is_empty() {
               break;
           }

           for target_zid in unvisited {
               let sel = format!("@/{target_zid}/**");
               if let Ok(entries) = self.query_admin_space(session_id, Some(&sel), (timeout_ms / 2).max(1000)).await {
                   for entry in entries {
                       if entry.key_expr.contains("/router/") {
                           let parts: Vec<&str> = entry.key_expr.split('/').collect();
                           if let Some(idx) = parts.iter().position(|&p| p == "router") {
                               if idx + 1 < parts.len() {
                                   let sub = parts[idx + 1].to_lowercase();
                                   if !visited_zids.contains(&sub) {
                                       next_wave_zids.push(sub);
                                   }
                               }
                           }
                       }
                       if key_set.insert(entry.key_expr.clone()) {
                           all_entries.push(entry);
                       }
                   }
               }
           }
           current_depth += 1;
       }

       Ok(all_entries)
   }
   ```

- [ ] **Step 4: Expose command in `commands/session_commands.rs` & `lib.rs`**

In `src-tauri/src/commands/session_commands.rs`:
```rust
#[tauri::command]
pub async fn discover_admin_topology(
    state: State<'_, AppState>,
    session_id: String,
    max_depth: Option<usize>,
    timeout_ms: Option<u64>,
) -> Result<Vec<AdminSpaceEntry>, String> {
    let sid = Uuid::parse_str(&session_id).map_err(|e| format!("Invalid session ID: {e}"))?;
    state
        .session_manager
        .discover_admin_topology(&sid, max_depth.unwrap_or(3), timeout_ms.unwrap_or(2000))
        .await
}
```
Register in `generate_handler!` in `src-tauri/src/lib.rs`.

- [ ] **Step 5: Run tests and verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: ALL PASS

- [ ] **Step 6: Commit changes**

```bash
git add src-tauri/src/zenoh/manager.rs src-tauri/src/commands/session_commands.rs src-tauri/src/lib.rs src-tauri/src/zenoh/tests.rs
git commit -m "feat(backend): add recursive admin topology discovery and extract remote connect locators"
```

---

### Task 2: Frontend Data Models, IPC Wrapper & Parser

**Files:**
- Modify: `src/types/topology.ts:80-120`
- Modify: `src/lib/tauri.ts:105-125`
- Modify: `src/lib/topology/adminSpaceParser.ts:170-350`
- Test: `tests/frontend/adminSpaceParser.test.ts`

**Interfaces:**
- Consumes: Backend Tauri command `discover_admin_topology`
- Produces:
  - `AdminRemoteNode.connectLocators: string[]`
  - `parseAdminSpaceEntries(entries: AdminSpaceEntry[]): AdminTopologyData` with populated `connectLocators`
  - `discoverAdminTopology(sessionId, maxDepth, timeoutMs)`

- [ ] **Step 1: Write failing frontend tests for connect locator parsing**

In `tests/frontend/adminSpaceParser.test.ts`, add:
```typescript
it('parses connect locators from session link and config entries', () => {
  const entries: AdminSpaceEntry[] = [
    {
      keyExpr: '@/remote-node-1/session/info',
      zid: 'remote-node-1',
      category: 'info',
      payloadJson: JSON.stringify({
        zid: 'remote-node-1',
        whatami: 'Peer',
        locators: ['tcp/192.168.1.50:7447'],
      }),
      timestamp: 1000,
    },
    {
      keyExpr: '@/remote-node-1/session/link/0',
      zid: 'remote-node-1',
      category: 'link',
      payloadJson: JSON.stringify({
        src: 'tcp/192.168.1.50:52134',
        dst: 'tcp/10.0.0.1:7447',
        is_streamed: true,
      }),
      timestamp: 1000,
    },
    {
      keyExpr: '@/remote-node-1/config',
      zid: 'remote-node-1',
      category: 'config',
      payloadJson: JSON.stringify({
        connect: {
          endpoints: ['tls/cloud.zenoh.io:7447'],
        },
      }),
      timestamp: 1000,
    },
  ];

  const parsed = parseAdminSpaceEntries(entries);
  const node = parsed.nodes.get('remote-node-1');
  assert.ok(node);
  assert.ok(node.connectLocators.includes('tcp/10.0.0.1:7447'));
  assert.ok(node.connectLocators.includes('tls/cloud.zenoh.io:7447'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/frontend/adminSpaceParser.test.ts`
Expected: FAIL (connectLocators is undefined or missing)

- [ ] **Step 3: Update `AdminRemoteNode` interface and `tauri.ts` wrapper**

1. In `src/types/topology.ts`:
   Add `connectLocators: string[];` to `AdminRemoteNode`.
2. In `src/lib/tauri.ts`:
   Add `discoverAdminTopology`:
   ```typescript
   export async function discoverAdminTopology(
     sessionId: string,
     maxDepth: number = 3,
     timeoutMs: number = 2000
   ): Promise<AdminSpaceEntry[]> {
     return invoke<AdminSpaceEntry[]>('discover_admin_topology', {
       sessionId,
       maxDepth,
       timeoutMs,
     });
   }
   ```

- [ ] **Step 4: Update `adminSpaceParser.ts`**

In `src/lib/topology/adminSpaceParser.ts`:
1. In `getOrCreateNode`, initialize `connectLocators: []`.
2. In category `'link'`, when `!isListenSocket && dst`:
   ```typescript
   const expandedDst = expandBoundLocator(dst, interfaces);
   node.connectLocators = filterRealLocators(
     Array.from(new Set([...node.connectLocators, ...expandedDst]))
   );
   ```
3. In category `'config'` or key containing `'/config'`:
   Parse `connect.endpoints` or `connect_locators`:
   ```typescript
   if (payloadObj) {
     const rawConnects: string[] = [];
     if (Array.isArray(payloadObj.connect_locators)) {
       payloadObj.connect_locators.forEach((c) => {
         if (typeof c === 'string') rawConnects.push(c);
       });
     }
     const cfg = payloadObj.connect as Record<string, unknown> | undefined;
     if (cfg && Array.isArray(cfg.endpoints)) {
       cfg.endpoints.forEach((ep) => {
         if (typeof ep === 'string') rawConnects.push(ep);
       });
     }
     if (rawConnects.length > 0) {
       node.connectLocators = filterRealLocators(
         Array.from(new Set([...node.connectLocators, ...rawConnects]))
       );
     }
   }
   ```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/frontend/adminSpaceParser.test.ts`
Expected: PASS

- [ ] **Step 6: Commit changes**

```bash
git add src/types/topology.ts src/lib/tauri.ts src/lib/topology/adminSpaceParser.ts tests/frontend/adminSpaceParser.test.ts
git commit -m "feat(topology): add connectLocators to AdminRemoteNode and enhance adminSpaceParser"
```

---

### Task 3: Topology Graph Builder Integration

**Files:**
- Modify: `src/lib/topology/topologyBuilder.ts:600-649`
- Modify: `src/lib/topology/topologyBuilder.ts:705-725`
- Test: `tests/frontend/topologyBuilder.test.ts`

**Interfaces:**
- Consumes: `AdminRemoteNode.connectLocators`
- Produces:
  - `TopologyNode.connectLocators` on admin remote nodes
  - Topology edges connecting remote sub-nodes to their upstream targets

- [ ] **Step 1: Write failing test in `topologyBuilder.test.ts`**

In `tests/frontend/topologyBuilder.test.ts`:
```typescript
it('populates connectLocators on remote admin nodes and links edges', () => {
  const adminData: AdminTopologyData = {
    nodes: new Map([
      [
        'sub-peer-1',
        {
          zid: 'sub-peer-1',
          whatami: 'peer',
          locators: ['tcp/192.168.1.200:7447'],
          connectLocators: ['tcp/10.0.0.1:7447'],
          neighbors: [],
          links: [],
        },
      ],
      [
        'parent-router-1',
        {
          zid: 'parent-router-1',
          whatami: 'router',
          locators: ['tcp/10.0.0.1:7447'],
          connectLocators: [],
          neighbors: ['sub-peer-1'],
          links: [],
        },
      ],
    ]),
    links: [
      {
        sourceZid: 'sub-peer-1',
        targetZid: 'parent-router-1',
        srcLocator: 'tcp/192.168.1.200:54321',
        dstLocator: 'tcp/10.0.0.1:7447',
      },
    ],
  };

  const { nodes, edges } = buildTopologyGraph({
    scoutedNodes: [],
    activeSessions: {},
    profiles: [],
    adminData,
  });

  const subNode = nodes.find((n) => n.zid === 'sub-peer-1');
  assert.ok(subNode);
  assert.deepEqual(subNode.connectLocators, ['tcp/10.0.0.1:7447']);

  const edge = edges.find(
    (e) =>
      (e.source === subNode.id && e.target === 'admin-parent-router-1') ||
      (e.target === subNode.id && e.source === 'admin-parent-router-1')
  );
  assert.ok(edge, 'Edge should exist between sub-node and parent router');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/frontend/topologyBuilder.test.ts`
Expected: FAIL (connectLocators is empty `[]`)

- [ ] **Step 3: Update `topologyBuilder.ts`**

In `src/lib/topology/topologyBuilder.ts`:
1. When mapping `admNode` to `TopologyNode`:
   ```typescript
   connectLocators: filterRealLocators(admNode.connectLocators || []),
   ```
2. When updating existing node:
   ```typescript
   if (admNode.connectLocators && admNode.connectLocators.length > 0) {
     existing.connectLocators = filterRealLocators(
       Array.from(new Set([...(existing.connectLocators || []), ...admNode.connectLocators]))
     );
   }
   ```
3. In Authoritative Live Edges:
   Ensure `adminData.links` generates edges between sub-nodes and their target parents (both ways if targetZid is known, or matching `dstLocator` against `node.locators`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/frontend/topologyBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/topology/topologyBuilder.ts tests/frontend/topologyBuilder.test.ts
git commit -m "feat(topology): populate connectLocators on remote nodes and build sub-node edges"
```

---

### Task 4: Topology Store, Canvas & Inspector UI Integration

**Files:**
- Modify: `src/stores/topologyStore.ts:192-240`
- Modify: `src/components/topology/TopologyInspector.tsx:410-445`
- Test: `tests/frontend/topologyIntegration.test.ts`

**Interfaces:**
- Consumes: `discoverAdminTopology`, `buildTopologyGraph`
- Produces:
  - Recursive multi-hop admin topology polling in `fetchAdminTopology`
  - Rendered connect locators for remote nodes and sub-nodes in `TopologyInspector`

- [ ] **Step 1: Write integration test for recursive admin polling in topologyStore**

In `tests/frontend/topologyIntegration.test.ts`:
Add a test verifying that `fetchAdminTopology` calls `discoverAdminTopology` and populates `adminData` with sub-nodes and remote connect locators.

- [ ] **Step 2: Update `topologyStore.ts`**

In `src/stores/topologyStore.ts`:
Import `discoverAdminTopology` from `../lib/tauri`.
In `fetchAdminTopology`:
```typescript
for (const s of sessionList) {
  try {
    const entries = await discoverAdminTopology(s.id, 3, 2500);
    if (Array.isArray(entries)) {
      allEntries.push(...entries);
    }
  } catch {
    // Fallback to single queryAdminSpace if discover fails
    try {
      const fallback = await queryAdminSpace(s.id, '@/**', 2000);
      if (Array.isArray(fallback)) allEntries.push(...fallback);
    } catch {}
  }
}
```

- [ ] **Step 3: Update `TopologyInspector.tsx`**

Ensure that for remote nodes:
- `node.connectLocators` displays under **Configured Upstreams (Connect Endpoints)** with the badge, truncated host/port, and copy button.
- If the node has active links to a parent router/peer, display connected target information.

- [ ] **Step 4: Run tests and verify full suite passes**

Run:
```bash
npm run test:all || (cargo test --manifest-path src-tauri/Cargo.toml && npm test)
```
Expected: ALL PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/stores/topologyStore.ts src/components/topology/TopologyInspector.tsx tests/frontend/topologyIntegration.test.ts
git commit -m "feat(ui): integrate recursive admin discovery and remote connect locators in Inspector"
```
