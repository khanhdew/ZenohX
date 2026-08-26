# 📜 Changelog

All notable changes to **ZenohX** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---



## [v0.5.3] - 2026-08-27

### 🚀 Added & Enhanced
- **backend:** add connect_node_by_zid command loading config from SQLite
- take live bound IP and port from created node and persist to DB/JSON5
- persist live bound endpoints only for router; retain 0.0.0.0:0 for peer and empty for client
- **topology:** remove synthetic fallback node and link generation in favor of live Zenoh telemetry
- **topology,tls:** rewrite topology builder from scratch and fix TLS client connection

### 🐛 Fixed
- **router:** prevent ephemeral port 0 for router listen endpoints and synchronize DB on connect

### ⚡ Changed & Refactored
- **ui:** send only zid/profileId to backend on connect
- optimize DB profile lookup by id and standardize store IPC imports
- **topology:** remove synthetic UI profile generation and delegate connect by zid to backend

### 🔧 Maintenance
- **backend:** add debug logging for saved and loaded JSON5 configurations

---
## [v0.5.2] - 2026-08-26

### 🐛 Fixed
- **pubsub:** ensure real-time message stream displays incoming samples without requiring tab switch
- **types:** resolve TypeScript compiler errors and remove unused imports

### 🔧 Maintenance
- add Apache-2.0 license headers and update gitignore
- release v0.5.2
- **scripts:** add dedicated npm test scripts for types, unit, rust, and all
- reset version back to 0.5.1 for clean release preparation

---
## [v0.5.1] - 2026-08-25

### 🚀 Added & Enhanced
- **updates:** add markdown compiler support for changelogs, cross-platform unixpipe test fix, clean script, and demo screenshot

### 🐛 Fixed
- **topology:** persist custom node names and support IPv6 locators
- **pubsub:** prevent subscriptions from disappearing on reload and preserve QoS origin options

### ⚡ Changed & Refactored
- **icons:** add 18% transparent padding safe area to app icons across all platforms

---
## [v0.5.0] - 2026-08-24

### 🚀 Added & Enhanced
- **zenoh:** implement direct rust introspection, router mesh reconnection & topology telemetry
- **pubsub:** implement high-throughput batched ingestion, QoS controls, traffic generator & subscriber locality
- **backend:** add gossip discovery and reconnect retry DTOs
- **backend:** dynamically resolve ephemeral ports via session locators
- **frontend:** expand transport protocol parser to 7 protocols including WebSockets and Unix sockets
- **ui:** redesign role selector and multi-transport endpoint builder
- **ui:** add mesh routing controls and live json5 inspection
- **ui:** display runtime bound locators with 1-click copy badge
- **topology:** synchronize JSON5 configuration with live node state and add JSON5 inspector preview
- **store:** create connectionJsonStore for live JSON5 sync across node details and edit connection page

### 🐛 Fixed
- **ui:** disable TLS encryption by default on new connection profiles
- **ui:** show only zid on connection sidebar cards without locators
- **ui:** remove locator badges from workspace bars and display clean zid
- resolve advertised locators to real host IPs and eliminate 0.0.0.0:0
- persist resolved node info to stored profile without creating duplicate connections
- **ui:** hot-reload active session on profile save and sync configured upstreams to UI detail
- **ui:** remove duplicated fields between preset forms and advanced settings
- preserve configured ephemeral listen locators and accurately map router profiles in topology editor
- **store:** propagate full scout_gossip, reconnect_retry and live ZID to session config and JSON5 preview
- **store:** resolve real bound IP and port in JSON5 preview for active sessions with wildcard or ephemeral endpoints
- **topology:** auto-purge scouted nodes on delete and allow direct node removal without scout
- **pubsub:** deduplicate self-publication loopback samples and eliminate redundant single sample IPC events
- **messaging:** resolve untimestamped messages, duplicate subscriber eviction, loadHistory session deduplication, and timestamp scale formatting

### 🔧 Maintenance
- **spec:** add node lifecycle and topology control design spec
- **plan:** add node lifecycle and topology control implementation plan
- verify all node lifecycle and multi-transport test suites pass

---
## [v0.4.0] - 2026-08-24

### 🚀 Added & Enhanced
- **query:** add queryable context menu, js editor with formatter, and dev telemetry guard
- **proto:** add protobufjs and core proto types
- **proto:** implement dynamic protobuf schema parser and codec engine
- **proto:** create protoStore for schema and topic mapping management
- **proto:** integrate protobuf codec into formatters and message stores
- **proto:** create Protobuf Schema Manager dialog
- **proto:** add Protobuf decoding tab and inspector to PayloadViewer
- **proto:** add Protobuf encoding mode and schema validator to PayloadEditor
- **settings:** embed Protobuf Schema Manager as a dedicated tab in Settings workspace
- **proto:** auto-generate sample template when changing protobuf type dropdown in PayloadEditor
- **topology:** add topology types and data builder with unit tests
- **topology:** add physics simulation engine and 2D canvas renderer with tests
- **topology:** add topologyStore with filtering and zoom operations
- **topology:** add interactive Canvas 2D component and floating controls
- **topology:** add topology toolbar with search, filters, layout switcher, and scout trigger
- **topology:** add node inspector drawer and right-click context menu
- **topology:** integrate Topology workspace tab into main app navigation
- **topology:** add auto-scout interval dropdown selector and background runner
- **topology:** convert auto-scout selector to connected split button on Scout LAN
- **topology:** add mesh protocol label for dynamic auto-discovered peer links
- **zenoh:** enforce hard 1-to-1 binding between UI profile and Rust peer session
- **topology:** bind persistent node ID to connection profiles and toggle node on/off
- **topology:** disable duplicate profile creation for already saved nodes
- **connections:** add strict TLS-only mode, dynamic TLS peer port, and rename presets to Client Mode and Peer

### 🐛 Fixed
- **topology:** support non-scouted active sessions, mouse-centric zoom, and cleanup sync
- **topology:** auto-mesh LAN peers in peer mode and restrict connect action to routers
- **topology:** only show local node when active session exists and show canvas empty state
- **topology:** remove artificial local node and model real Zenoh router/peer/client network topology
- **topology:** filter out own ZenohX session and deduplicate localhost/LAN router nodes
- **topology:** default peer mesh edges to tcp and match sessions by zid
- **topology:** seamlessly merge active peer sessions with scouted network nodes
- **connection:** enforce 1-to-1 session lifecycle and prevent duplicate session creation
- **multi-window:** sync active session state across windows and emit broadcast events
- **topology:** improve locator parsing, matching, and live session locator recognition
- **topology:** exclude offline non-scouted profiles from topology graph
- **topology:** guarantee strictly unique ZID across all topology nodes and scout replies
- **topology:** verify ZID and existing profile matching before saving or connecting
- **topology:** clarify empty locator state for dynamic multicast peers in inspector
- **topology:** resolve auto-scout interval scaling and add initial scan on mount
- **security:** support TLS and mTLS configuration for Local LAN peers with correct Zenoh 1.10.0 keys

### ⚡ Changed & Refactored
- **proto:** remove modal dialog and top-left header button in favor of Settings > Protobuf Manager

### 🔧 Maintenance
- add protobuf schema registry and codec design spec
- add Protobuf schema registry and codec implementation plan
- update README with Protobuf schema registry and codec documentation
- add design spec for network topology graph
- add implementation plan for network topology graph

---
## [v0.3.0] - 2026-08-23

### 🚀 Added & Enhanced
- **error-handling:** format gentle and user-friendly error messages across stores and UI
- **telemetry:** include client country, locale, and timezone metadata
- **queryable,pubsub:** add recent keys to publish bar and JS script execution to queryables

### 🐛 Fixed
- **telemetry:** add safe env checks and dev debug logging
- **telemetry:** include distinct_id in properties dictionary
- **telemetry:** use canonical /i/v0/e/ endpoint and dual token fields
- **telemetry:** add standard lib metadata to PostHog payload
- **telemetry:** remove root token field to match PostHog Rust capture schema

### 🔧 Maintenance
- **telemetry:** remove debug console logging
- update README with JS script queryables, recent keys, and add GitHub issue templates

---
## [v0.2.3] - 2026-08-23

### 🚀 Added & Enhanced
- auto-download updates with user consent and anonymous PostHog telemetry

---
## [v0.2.2] - 2026-08-23

### 🚀 Added & Enhanced
- **query:** enhance Query/RPC workspace, multi-node replies, and responsive split stage

### 🔧 Maintenance
- add application demo screenshot to README
- add total release downloads badge to README

---
## [v0.2.1] - 2026-08-23

### 🚀 Added & Enhanced
- **release:** add release automation script and refine UI headers and settings icon

---
## [v0.2.0] - 2026-08-23

### 🚀 Added & Enhanced
- **Real-time Traffic Monitor Workspace:** Dedicated telemetry tab visualizing network throughput (`KB/s`, `MB/s`) and message rates (`msgs/s`) with live Inbound vs. Outbound breakdown.
- **Responsive Dual-Stream Time-Series Chart:** Custom SVG-based area chart using Catmull-Rom cubic Bézier curves, auto-scaling Y-axis, live crosshair hover tooltips, and `ResizeObserver` dynamic viewport tracking.
- **Per-Topic Telemetry Breakdown:** Real-time filterable and sortable table tracking cumulative bandwidth share, message frequency, and relative timestamps per key expression.
- **Global Background Telemetry Interception:** Non-blocking rate instrumentation across all Pub/Sub and Query operations with continuous background 1-second time bucketing.
- **Top Navigation & Keyboard Shortcuts:** Added `Ctrl+3` / `Cmd+3` shortcut for Traffic Monitor workspace and real-time throughput indicator pill in the application header.

---

## [v0.1.1] - 2026-08-23

### 🚀 Added & Enhanced
- **RHEL & Fedora RPM Packages:** Added automated `.rpm` package generation for Red Hat Enterprise Linux, Fedora, CentOS, Rocky Linux, and openSUSE.
- **One-Liner Install Scripts:**
  - Added [`scripts/install.sh`](scripts/install.sh) for Linux (RPM/DEB/AppImage) and macOS (DMG).
  - Added [`scripts/install.ps1`](scripts/install.ps1) for Windows PowerShell (MSI/EXE).
- **Dynamic Asset Discovery:** Installers dynamically resolve the latest release and architecture assets directly from GitHub with zero rate-limit issues.
- **Auto-Updater Integration:** Seamless background update downloading and verification with Minisign signatures.

### 🐛 Fixed
- **Windows Test Runner:** Fixed path resolution (`fileURLToPath`) in custom ESM loader for Windows CI runners.
- **Session Disconnection:** Made `SessionManager::disconnect()` resilient to close handshake network timeouts.
- **Message List UI:** Topic border indicators now render on the left for incoming (`IN`) and right for outgoing (`OUT`) messages with a cleaner dot-free header.

---

## [v0.1.0] - 2026-08-23

### 🎉 Initial Release
- **Pub / Sub Workspace:** High-throughput streaming with key expression subscriptions and virtualized feed.
- **Query / RPC Evaluation:** Distributed query evaluation with latency tracking and automated queryable responders.
- **Local LAN Scout:** Automated multicast discovery of Zenoh routers and peers on `224.0.0.224:7446`.
- **Payload Inspector:** Multi-mode editor and viewer supporting JSON, CBOR, Text, and Raw Hex with syntax highlighting.
- **Security:** Complete TLS and Mutual TLS (mTLS) with custom CA, client certificates, and user authentication.
- **Persistence:** Local SQLite storage with full-text search and historical message inspection.
