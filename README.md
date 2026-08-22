<div align="center">

<img src="public/icon.png" width="96" height="96" alt="ZenohX Logo" style="border-radius: 18px;" />

# ZenohX

**Modern, high-performance desktop GUI client for Eclipse Zenoh (1.x Protocol).**

[![Release](https://img.shields.io/github/v/release/khanhdew/ZenohX?style=flat-square&color=blue)](https://github.com/khanhdew/ZenohX/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/khanhdew/ZenohX/releases)
[![Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8D8?style=flat-square&logo=tauri)](https://tauri.app)

[**Download ZenohX**](https://github.com/khanhdew/ZenohX/releases/latest) • [**Features**](#features) • [**Installation**](#installation) • [**Building from Source**](#building-from-source)

</div>

---

## ✨ Features

- **🚀 Real-Time Pub / Sub Streaming:**
  - Subscribe to multiple key expressions (`sensor/**`, `robot/*/telemetry`) with custom color tags.
  - Direction indicators: Left border for incoming (`IN`) samples, Right border for outgoing (`OUT`) samples.
  - Virtualized message list handling 5,000+ live samples smoothly in memory.
- **🔍 Distributed Query & RPC Evaluation:**
  - Send queries across Zenoh routers and peers with latency tracking.
  - Register queryables with automated JSON/CBOR reply responder.
- **📡 Automatic Local LAN Multicast Scout:**
  - Discover Zenoh routers and peers announcing on UDP multicast (`224.0.0.224:7446`) with 1-click connect.
- **🔒 TLS & Mutual TLS (mTLS) Support:**
  - Connect securely over `tls/`, `tcp/`, `quic/`, and `udp/`.
  - Custom Root CA, client certificate, and private key authentication.
- **📦 Multi-Format Payload Codec & Hex Editor:**
  - Real-time viewer & editor with syntax highlighting for **JSON**, **CBOR**, **Plain Text**, and **RAW/Hex**.
- **💾 Local SQLite Message Persistence:**
  - Persist historical messages to local SQLite database with full-text and hex byte search.
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
| **Universal Linux** | `.AppImage` | `chmod +x zenohx.AppImage && ./zenohx.AppImage` |

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

## 📄 License

Distributed under the **Apache License 2.0**. See [`LICENSE`](LICENSE) for more details.
