<div align="center">

<img src="public/icon.png" width="96" height="96" alt="ZenohX Logo" style="border-radius: 18px;" />

# ZenohX

**Modern, AI-driven desktop GUI client & Model Context Protocol (MCP) server for Eclipse Zenoh (1.x Protocol).**

[![Release](https://img.shields.io/github/v/release/khanhdew/ZenohX?style=flat-square&color=blue)](https://github.com/khanhdew/ZenohX/releases)
[![Downloads](https://img.shields.io/github/downloads/khanhdew/ZenohX/total?style=flat-square&color=blue)](https://github.com/khanhdew/ZenohX/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/khanhdew/ZenohX/releases)
[![Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8D8?style=flat-square&logo=tauri)](https://tauri.app)

[**Download ZenohX**](https://github.com/khanhdew/ZenohX/releases/latest) • [**Features**](#features) • [**Installation**](#installation) • [**Building from Source**](#building-from-source) • [**AI Control (MCP)**](#-ai-control-via-model-context-protocol-mcp) • [**Contributing**](#contributing)

<br/>

<img src="public/demo.png" alt="ZenohX Interface Demo" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.12);" width="100%" />

</div>

---

## ✨ Features

- **🤖 AI-Driven Automation & Model Context Protocol (MCP):**
  - **Native MCP Server (`zenohx-mcp`)**: Connect AI assistants and autonomous agents (Claude Desktop, Cursor, Antigravity, VS Code) to Zenoh networks over standard JSON-RPC 2.0.
  - **Dual Runtime Modes**: Live GUI mode with real-time UI synchronization and bidirectional IPC, or headless CLI mode for server/CI/embedded deployments.
  - **Comprehensive Agent Toolset**: 16 dedicated tools for topology inspection, LAN discovery, node creation and editing, pub/sub data streaming, and distributed JavaScript RPC handling.
- **🌐 Interactive Network Topology & Mesh Visualizer:**
  - **Live Graph Rendering**: Visualize connected routers, peers, clients, and discovered nodes with interactive force-directed and radial layouts.
  - **Live Traffic Animation**: Real-time visual pulses along communication links on incoming and outgoing pub/sub samples.
  - **Configurable Auto-Scout**: Background network discovery with interval selector (1s – 60s) or 1-click manual LAN multicast sweep.
  - **Node Inspector Drawer**: View live node telemetry, connected peer links, runtime bound locators, and save discovered nodes to persistent profiles.
- **🚀 Real-Time Pub / Sub Streaming & Traffic Generator:**
  - Subscribe to multiple key expressions (`sensor/**`, `robot/*/telemetry`) with custom color tags and wildcard matching.
  - Granular **QoS Controls**: Configure Reliability (`Express` / `Reliable`), Congestion Control (`Drop` / `Block`), Priority, and Subscriber Locality.
  - **Continuous & Burst Stream Generator**: Built-in traffic generator to simulate sensor streams with configurable intervals and payload templates.
  - Direction indicators: Left border for incoming (`IN`) samples, Right border for outgoing (`OUT`) samples.
  - High-throughput batched ingestion and virtualized feed handling 10,000+ live messages smoothly in memory.
- **🔌 Multi-Transport Network Architecture (7 Supported Protocols):**
  - Native support for **`tcp/`**, **`tls/`**, **`udp/`**, **`quic/`**, **`ws/` (WebSockets)**, **`wss/` (Secure WebSockets)**, and **`unixpipe/` (Unix Domain Sockets)**.
  - Role-specific configuration with dedicated presets for **Router**, **Peer**, and **Client** modes.
  - Dynamic port resolution (`:0`) with 1-click copy badge for runtime bound locators.
- **🔒 Advanced TLS & Mutual TLS (mTLS) Security:**
  - Custom Root CA, client certificates, and private key configuration.
  - **Strict TLS-Only Mode** to enforce encrypted links across all connections.
  - User authentication with credentials and token authorization.
- **⚙️ Live JSON5 Configuration Inspector & Sync:**
  - Real-time bidirectional JSON5 configuration preview and editor.
  - Synchronized with active session parameters, runtime locators, scouting policies, gossip discovery, and reconnect retry settings.
- **⚡ Dynamic Protocol Buffers (Protobuf) Schema Registry & Codec:**
  - **In-App Schema Manager**: Upload `.proto` files, write/edit schema definitions in real-time with instant syntax validation and code formatting (`Ctrl+Shift+P` / `Cmd+Shift+P`).
  - **Built-in Robotics & IoT Presets**: Ready-to-use starter schemas for standard payloads (`sensor_msgs.proto`, `robot_control.proto`, and `geometry_msgs.proto`).
  - **Automatic Topic-to-Schema Mapping**: Bind Zenoh key expression patterns (e.g. `robot/sensors/**`) directly to target Protobuf message decoders.
  - **Real-Time JSON ↔ Protobuf Codec**: Encode structured JSON payloads to binary Protobuf on publish/query and decode incoming binary wire payloads back to formatted JSON and interactive tree views.
  - **1-Click Sample Payload Generator**: Scaffold valid mock JSON templates from any compiled Protobuf message descriptor.
- **🔍 Distributed Query & RPC Simulator:**
  - Send queries across Zenoh routers and peers with latency tracking and multi-reply timeline.
  - **Dynamic JavaScript Script Execution**: Run custom JS logic to dynamically compute replies from URL query parameters (`query.params`, `query.keyExpr`, `query.payload`) alongside static payloads.
  - **Interactive Script Sandbox**: Test and debug your JavaScript RPC logic live before deploying.
  - Built-in templates for RPC Calculators, Dynamic Telemetry Sensors, Echo Inspectors, and Health Status endpoints.
- **📊 Traffic & Network Telemetry:**
  - Real-time throughput metrics (bytes/sec, messages/sec), timeline charts, and per-key traffic breakdown tables.
- **📡 Automatic Local LAN Multicast Scout & Gossip Discovery:**
  - Discover Zenoh routers and peers announcing on UDP multicast (`224.0.0.224:7446`) with 1-click connect and mesh gossip propagation.
- **📦 Multi-Format Payload Codec & Hex Editor:**
  - Real-time viewer & editor with syntax highlighting for **JSON**, **CBOR**, **Protocol Buffers (Protobuf)**, **Plain Text**, and **RAW/Hex**.
  - Interactive tree inspector, live schema validation, and wire byte size calculations.
- **💾 Local SQLite Storage & Persistence:**
  - Securely store connection profiles, queryable presets, query executions, and message logs in the OS application data directory with full-text search.
- **🔄 Built-in Cryptographic Auto-Updater:**
  - Seamless in-app updates verified via Minisign digital signatures.

---

## 📥 Installation

### 1. One-Liner Install Script (Fastest)

**Linux & macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/khanhdew/ZenohX/main/scripts/install.sh | bash
```

**Windows (PowerShell as Administrator or User):**
```powershell
irm https://raw.githubusercontent.com/khanhdew/ZenohX/main/scripts/install.ps1 | iex
```

---

### 2. Download Installers (GitHub Releases)

Download pre-packaged installers directly from [**GitHub Releases**](https://github.com/khanhdew/ZenohX/releases/latest):

| Operating System | Package | Install Method |
| :--- | :--- | :--- |
| **macOS** (Apple Silicon / Intel) | `.dmg` | Open `.dmg` and drag to Applications |
| **Windows** (x64) | `.msi` / `.exe` | Run installer |
| **Ubuntu / Debian / Mint** | `.deb` | `sudo dpkg -i zenohx_*_amd64.deb` |
| **RHEL / Fedora / Rocky Linux** | `.rpm` | `sudo dnf install ./zenohx-*.x86_64.rpm` |
| **Universal Linux** | `.AppImage` | `chmod +x zenohx.AppImage && ./zenohx.AppImage` |

> [!TIP]
> **First-Launch Notes for macOS & Windows:**
> - **macOS (Gatekeeper):** If macOS prevents opening the downloaded app with a verification warning, run:
>   ```bash
>   xattr -cr /Applications/ZenohX.app
>   ```
> - **Windows (SmartScreen):** If Windows Defender SmartScreen appears, click **"More info"** &rarr; **"Run anyway"**.

---

## 🛠️ Building from Source

### Prerequisites
- [Node.js](https://nodejs.org) (v18+)
- [Rust & Cargo](https://rustup.rs) (v1.75+)
- Linux system dependencies (Ubuntu/Debian):
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```

### Development Setup

```bash
# 1. Clone repository
git clone https://github.com/khanhdew/ZenohX.git
cd ZenohX

# 2. Install NPM dependencies
npm install

# 3. Run development mode (Vite + Tauri)
npm run tauri dev
```

### Production Build

```bash
npm run build
npm run tauri build
```
Binaries will be output to `src-tauri/target/release/bundle/`.

---

## 🤖 AI Control via Model Context Protocol (MCP)

ZenohX includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server (`zenohx-mcp`) communicating over standard input/output (`stdio`) via JSON-RPC 2.0. This allows AI assistants and agentic coding workflows (such as Claude Desktop, Cursor, and Antigravity) to programmatically inspect network topologies, scout Zenoh peers, publish and subscribe to data streams, and query distributed storage.

### Operating Modes

The MCP server operates seamlessly in two runtime modes:

1. **Live GUI Mode (Connected to Desktop App)**:
   - When the ZenohX desktop application is open, `zenohx-mcp` automatically detects and connects to its local IPC Unix domain socket (`/tmp/zenohx-ipc.sock` on Unix/Linux/macOS).
   - Tool executions (e.g. switching workspaces, publishing messages, inspecting nodes) execute directly against the live GUI state and trigger real-time AI action notifications in the ZenohX desktop interface.
2. **Headless Mode (Standalone Fallback)**:
   - If the ZenohX desktop application is not running, `zenohx-mcp` automatically falls back to an independent headless Zenoh session runtime and local SQLite storage engine.
   - All Zenoh networking tools (scouting, pub/sub, queries, session management) remain fully functional without requiring the graphical interface.

---

### Client Configuration

You can configure your MCP client automatically using the built-in installer or manually using JSON.

#### Automatic Setup (One-Click or CLI)

ZenohX can automatically detect and configure your local AI agents (Claude Desktop, Cursor, Antigravity, Windsurf, Cline, Roo Code, Codex, Hermes, OpenClaw):

* **From Desktop GUI**: Navigate to **Settings** &rarr; **Agents** and click **Install** next to any detected agent, or **Install All Detected**.
* **From CLI**: Run `zenohx-mcp install <agent_id>` (or `zenohx-mcp install --all`). Run `zenohx-mcp list` to view all supported agents and their detection status.

---

#### Manual Configuration

> [!IMPORTANT]
> **Always use `--silent` with npm:**
> When configuring MCP clients via `npm run`, you **must** pass `--silent` (e.g., `npm run --silent mcp`). Without `--silent`, npm writes startup banners and lifecycle logs to `stdout`, which corrupts the stdio JSON-RPC protocol stream and breaks MCP client communication.

##### 1. Claude Desktop

Add the `zenohx` server configuration to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Using compiled binary (Recommended for lowest latency):**
```json
{
  "mcpServers": {
    "zenohx": {
      "command": "/absolute/path/to/ZenohX/src-tauri/target/release/zenohx-mcp"
    }
  }
}
```

**Using npm:**
```json
{
  "mcpServers": {
    "zenohx": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "cwd": "/absolute/path/to/ZenohX"
    }
  }
}
```

##### 2. Cursor IDE

In Cursor Settings &rarr; **Features** &rarr; **MCP** (or `.cursor/mcp.json` in your workspace):

```json
{
  "mcpServers": {
    "zenohx": {
      "command": "/absolute/path/to/ZenohX/src-tauri/target/release/zenohx-mcp"
    }
  }
}
```

##### 3. Antigravity & Generic MCP Clients

In your client's MCP configuration settings:

```json
{
  "mcpServers": {
    "zenohx": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "cwd": "/absolute/path/to/ZenohX"
    }
  }
}
```

---

### Available MCP Tools & Resources

For detailed information on the tools, input schemas, and resources available via the ZenohX MCP server, please refer to the [**MCP API Documentation**](docs/api/README.md).

---

## 🤝 Contributing & Community

ZenohX is a Free and Open Source Software (FOSS) project. We welcome contributions, bug reports, feature requests, and community discussions!

- **🐛 Report a Bug:** Open an issue with our [Bug Report Template](https://github.com/khanhdew/ZenohX/issues/new?template=bug_report.yml).
- **💡 Suggest a Feature:** Propose ideas using our [Feature Request Template](https://github.com/khanhdew/ZenohX/issues/new?template=feature_request.yml).
- **💬 Discussions:** Join our community on [GitHub Discussions](https://github.com/khanhdew/ZenohX/discussions).
- **Pull Requests:** Check that all tests pass (`npm test`) and typechecks pass (`npx tsc --noEmit`) before submitting a PR.

---

## 🚀 Release Automation (Maintainers)

ZenohX includes an automated release workflow that handles version synchronization (`package.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`), conventional changelog generation, and tag creation:

```bash
# Bump version and generate release changelog (patch: 0.2.0 -> 0.2.1)
npm run release:new -- patch

# Or minor / major / explicit version:
npm run release:new -- minor
npm run release:new -- 1.0.0

# Push changes and trigger cross-platform GitHub Actions build
git push origin main --tags
```

---

## 📄 License

Distributed under the **Apache License 2.0**. See [`LICENSE`](LICENSE) for more details.
