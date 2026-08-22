# 📜 Changelog

All notable changes to **ZenohX** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
