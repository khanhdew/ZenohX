#!/usr/bin/env bash

# ==============================================================================
# ZenohX One-Liner Installer for Linux & macOS
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/khanhdew/ZenohX/main/scripts/install.sh | bash
# ==============================================================================

set -e

REPO="khanhdew/ZenohX"
INSTALL_DIR_LINUX="${HOME}/.local/bin"
APPLICATIONS_DIR_LINUX="${HOME}/.local/share/applications"
ICONS_DIR_LINUX="${HOME}/.local/share/icons/hicolor/512x512/apps"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${CYAN}[ZenohX]${NC} $1"; }
success() { echo -e "${GREEN}[ZenohX] ✓${NC} $1"; }
warn() { echo -e "${YELLOW}[ZenohX] !${NC} $1"; }
error() { echo -e "${RED}[ZenohX Error] ✗${NC} $1" >&2; exit 1; }

# 1. Detect OS & Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

log "Detecting system architecture... (${OS} - ${ARCH})"

case "${OS}" in
  Linux)
    case "${ARCH}" in
      x86_64|amd64) ASSET_NAME="zenohx_amd64.AppImage" ;;
      *) error "Unsupported Linux architecture: ${ARCH}. ZenohX currently provides x86_64 releases." ;;
    esac
    ;;
  Darwin)
    case "${ARCH}" in
      arm64|aarch64) ASSET_NAME="ZenohX_aarch64.dmg" ;;
      x86_64) ASSET_NAME="ZenohX_x64.dmg" ;;
      *) ASSET_NAME="ZenohX_x64.dmg" ;;
    esac
    ;;
  *)
    error "Unsupported operating system: ${OS}. For Windows, use the PowerShell installer."
    ;;
esac

# 2. Fetch Latest Release Info from GitHub
log "Querying latest release from GitHub (https://github.com/${REPO})..."

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

RELEASE_DATA="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)"

if [ -z "${RELEASE_DATA}" ]; then
  # Fallback if GitHub API rate limit is exceeded
  TAG="v0.1.0"
  warn "GitHub API rate limit or network issue. Defaulting to ${TAG}."
else
  TAG="$(echo "${RELEASE_DATA}" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d'"' -f4)"
fi

if [ -z "${TAG}" ]; then
  TAG="v0.1.0"
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
DOWNLOAD_FILE="${TMP_DIR}/${ASSET_NAME}"

log "Downloading ZenohX ${TAG} (${ASSET_NAME})..."
if ! curl -fSL --progress-bar "${DOWNLOAD_URL}" -o "${DOWNLOAD_FILE}"; then
  # Fallback to direct latest download endpoint
  FALLBACK_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"
  log "Trying fallback download url: ${FALLBACK_URL}..."
  curl -fSL --progress-bar "${FALLBACK_URL}" -o "${DOWNLOAD_FILE}" || error "Failed to download ZenohX binary."
fi

# 3. Install
if [ "${OS}" = "Darwin" ]; then
  log "Installing ZenohX to /Applications..."
  MOUNT_DIR="${TMP_DIR}/mount"
  mkdir -p "${MOUNT_DIR}"
  hdiutil attach "${DOWNLOAD_FILE}" -mountpoint "${MOUNT_DIR}" -quiet -nobrowse

  # Copy App
  if [ -d "/Applications/ZenohX.app" ]; then
    rm -rf "/Applications/ZenohX.app"
  fi
  cp -R "${MOUNT_DIR}/ZenohX.app" /Applications/
  hdiutil detach "${MOUNT_DIR}" -quiet

  # Create CLI symlink in /usr/local/bin if writable, else ~/.local/bin
  CLI_DIR="/usr/local/bin"
  if [ ! -w "${CLI_DIR}" ]; then
    CLI_DIR="${HOME}/.local/bin"
    mkdir -p "${CLI_DIR}"
  fi

  ln -sf "/Applications/ZenohX.app/Contents/MacOS/zenohx" "${CLI_DIR}/zenohx" 2>/dev/null || true

  success "ZenohX ${TAG} installed to /Applications/ZenohX.app!"
  success "You can launch ZenohX from Spotlight, Launchpad, or by typing: zenohx"

elif [ "${OS}" = "Linux" ]; then
  mkdir -p "${INSTALL_DIR_LINUX}"
  mkdir -p "${APPLICATIONS_DIR_LINUX}"
  mkdir -p "${ICONS_DIR_LINUX}"

  TARGET_BIN="${INSTALL_DIR_LINUX}/zenohx"
  cp "${DOWNLOAD_FILE}" "${TARGET_BIN}"
  chmod +x "${TARGET_BIN}"

  # Create .desktop file for system application menu
  DESKTOP_FILE="${APPLICATIONS_DIR_LINUX}/zenohx.desktop"
  cat <<EOF > "${DESKTOP_FILE}"
[Desktop Entry]
Name=ZenohX
Comment=Modern GUI client for Eclipse Zenoh
Exec=${TARGET_BIN} %U
Terminal=false
Type=Application
Icon=zenohx
Categories=Development;Network;
StartupWMClass=zenohx
EOF
  chmod +x "${DESKTOP_FILE}"

  # Try to update desktop database
  update-desktop-database "${APPLICATIONS_DIR_LINUX}" 2>/dev/null || true

  success "ZenohX ${TAG} installed to ${TARGET_BIN}"
  success "Desktop shortcut registered in your Applications menu!"

  # Check PATH
  if [[ ":$PATH:" != *":${INSTALL_DIR_LINUX}:"* ]]; then
    warn "Note: ${INSTALL_DIR_LINUX} is not in your current \$PATH."
    warn "Add this line to your ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

log "Done! Launch ZenohX by running 'zenohx' in your terminal."
