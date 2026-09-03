# Design Specification: Recursive Sub-Node Discovery & Remote Connect Locators in Topology

## Overview
ZenohX visualizes the active network topology of local and remote Zenoh nodes (routers, peers, clients). Currently, remote nodes introspected via Zenoh Admin Space (`@/**`) only have their listen endpoints parsed (`locators: string[]`), while their outgoing connect endpoints remain empty (`connectLocators: []`). Furthermore, multi-hop sub-nodes connected behind remote routers/peers are not traversed.

This specification details:
1. A recursive Breadth-First Search (BFS) discovery engine in the Rust backend (`src-tauri`) that queries `@/**` and subsequent `@/<sub_zid>/**` admin keys up to a configurable maximum depth.
2. Comprehensive extraction of `connectLocators` from link destination addresses and configuration payloads in both Rust and TypeScript.
3. Graph construction and UI presentation of remote sub-nodes, their connecting edges, and their connect endpoints in the Topology Inspector.

---

## Architecture & Data Flow

```
+-------------------------------------------------------------------------+
| Frontend (Topology Workspace / Store)                                   |
|   1. Polls `discoverAdminTopology(sessionId, maxDepth: 3, timeoutMs)`   |
+------------------------------------+------------------------------------+
                                     | Tauri IPC
                                     v
+------------------------------------+------------------------------------+
| Backend (src-tauri / SessionManager)                                    |
|   2. Query seed `@/**` across Zenoh mesh via `session.get`              |
|   3. Parse discovered parent & sub-node ZIDs from replies               |
|   4. Iteratively query unvisited `@/<sub_zid>/**` (depth <= maxDepth)   |
|   5. Consolidate and return all deduplicated `AdminSpaceEntry` items    |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
| Frontend Parser & Topology Builder                                      |
|   6. `parseAdminSpaceEntries`: extracts `locators` & `connectLocators`  |
|   7. `buildTopologyGraph`: generates nodes & edges for sub-nodes        |
|   8. `TopologyInspector` & `canvasRenderer`: renders badges & links     |
+-------------------------------------------------------------------------+
```

---

## Detailed Components

### 1. Rust Backend Discovery Engine (`src-tauri`)

#### 1.1 `SessionManager::discover_admin_topology` (`src-tauri/src/zenoh/manager.rs`)
- **Signature:**
  ```rust
  pub async fn discover_admin_topology(
      &self,
      session_id: &Uuid,
      max_depth: usize,
      timeout_ms: u64,
  ) -> Result<Vec<AdminSpaceEntry>, String>
  ```
- **Algorithm:**
  1. Initialize `visited_zids: HashSet<String>`.
  2. Execute root query `@/**` with timeout. Parse returned entries into `AdminSpaceEntry` list.
  3. Extract newly found ZIDs from:
     - Root path segments `@/<zid>/...`
     - Router neighbors: `@/<zid>/router/<neighbor_zid>`
     - Link payloads: `{"zid": "<remote_zid>", "dst": "..."}`
     - Transports: `@/<zid>/session/transport/unicast/<peer_zid>`
  4. For `current_depth = 1..max_depth`:
     - Filter unvisited ZIDs. If empty, break.
     - Spawn parallel queries for `@/<zid>/**` with a per-hop timeout (e.g., 1500ms).
     - Collect entries and extract newly discovered ZIDs for the next wave.
  5. Deduplicate all collected entries by `key_expr` and return.

#### 1.2 `SessionManager::get_node_configuration` (`src-tauri/src/zenoh/manager.rs`)
- Inspect remote node admin entries:
  - Extract active outgoing `dst` locators from `/session/link` entries (filtering out loopback addresses).
  - Extract configured connect endpoints from `/config` entries (if `connect: { endpoints: [...] }` exists).
  - Populate `NodeConfigurationResult.connect_locators`.

#### 1.3 Tauri Command Registration (`src-tauri/src/commands/session_commands.rs`, `src-tauri/src/lib.rs`)
- Add `discover_admin_topology` Tauri command and register it in `tauri::generate_handler!`.

---

### 2. Frontend IPC & Types (`src/lib/tauri.ts`, `src/types/topology.ts`)

#### 2.1 Types (`src/types/topology.ts`)
```typescript
export interface AdminRemoteNode {
  zid: string;
  whatami: 'router' | 'peer' | 'client';
  version?: string;
  locators: string[];
  connectLocators: string[]; // Outgoing connect addresses
  neighbors: string[];
  links: SessionLinkInfo[];
  rawInfo?: Record<string, unknown>;
}
```

#### 2.2 IPC Wrapper (`src/lib/tauri.ts`)
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

---

### 3. Parser & Graph Builder (`src/lib/topology/`)

#### 3.1 `adminSpaceParser.ts`
- In `parseAdminSpaceEntries`:
  - Ensure every `AdminRemoteNode` has `connectLocators: []`.
  - On `/session/link/*` entries:
    - If `dst` is non-empty and not a listen socket, add `dst` to `node.connectLocators`.
    - If `remoteZid` exists, record target node and link.
  - On `/config/*` or `/session/info` entries:
    - If `connect.endpoints` or `connect_locators` are present in payload JSON, add to `node.connectLocators`.
  - Deduplicate and normalize via `filterRealLocators`.

#### 3.2 `topologyBuilder.ts`
- When mapping `AdminRemoteNode` to `TopologyNode`:
  - Populate `connectLocators: filterRealLocators(admNode.connectLocators || [])`.
- When adding edges:
  - Link sub-nodes to their upstream parents based on `adminData.links` and `connectLocators` matching parent `locators`.

---

### 4. Store & UI Visualization (`src/stores/`, `src/components/topology/`)

#### 4.1 `topologyStore.ts`
- In `fetchAdminTopology`:
  - Use `discoverAdminTopology(s.id, 3, 2500)`.
  - Process entries with `parseAdminSpaceEntries` and sync graph.

#### 4.2 `TopologyInspector.tsx`
- The existing **Configured Upstreams (Connect Endpoints)** section will now naturally display `node.connectLocators` for remote nodes and sub-nodes with protocol badges and copy buttons.
- Display parent connection context for sub-nodes.

#### 4.3 `canvasRenderer.ts`
- Search bar query matching already checks `node.connectLocators`; verified to highlight remote nodes matching connect IPs/ports.

---

## Error Handling & Edge Cases
1. **Network Cycles / Infinite Loops:** Guarded by `visited_zids` set in Rust BFS.
2. **Hop Depth Exhaustion:** Bounded by `max_depth` (default: 3 hops) to prevent query storms.
3. **Session Disconnect:** If an active session drops, admin queries safely abort without unhandled panics or state corruption.
4. **Duplicate Locators & Loopbacks:** Filtered using `filterRealLocators` and `isEphemeralPortLocator`.

---

## Verification Plan
1. **Backend Unit Tests (`src-tauri/src/zenoh/tests.rs`):**
   - Test `discover_admin_topology` with single and multi-node simulated admin entries.
   - Test `get_node_configuration` extracts `connect_locators` for remote nodes.
2. **Frontend Unit Tests:**
   - `tests/frontend/adminSpaceParser.test.ts`: Add test cases verifying `connectLocators` extraction from `/session/link` and `/config`.
   - `tests/frontend/topologyBuilder.test.ts`: Test graph generation with sub-nodes and remote connect locators.
3. **Manual / Full Integration Verification:**
   - Run `cargo test` in `src-tauri`.
   - Run `npm test` in root.
   - Launch ZenohX and verify topology displays remote sub-nodes and connect locators.
