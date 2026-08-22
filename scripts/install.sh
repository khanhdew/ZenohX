#!/usr/bin/env bash

# ==============================================================================
# ZenohX One-Liner Installer for Linux (RHEL, Fedora, Debian, Ubuntu) & macOS
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/khanhdew/ZenohX/main/scripts/install.sh | bash
# ==============================================================================

set -e

REPO="khanhdew/ZenohX"
INSTALL_DIR_LINUX="${HOME}/.local/bin"
APPLICATIONS_DIR_LINUX="${HOME}/.local/share/applications"

# Terminal Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log() { echo -e "${CYAN}[ZenohX]${NC} $1"; }
success() { echo -e "${GREEN}[ZenohX] ✓${NC} $1"; }
warn() { echo -e "${YELLOW}[ZenohX] !${NC} $1"; }
error() { echo -e "${RED}[ZenohX Error] ✗${NC} $1" >&2; exit 1; }

# 1. Detect OS, Architecture & Linux Distribution
OS="$(uname -s)"
ARCH="$(uname -m)"
DISTRO="unknown"
PACKAGE_TYPE="appimage"

if [ "${OS}" = "Linux" ]; then
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO="${ID:-unknown}"
    DISTRO_LIKE="${ID_LIKE:-}"
  fi

  # Check for RHEL / Fedora / CentOS / Rocky / AlmaLinux / openSUSE
  if [[ "${DISTRO}" =~ ^(rhel|fedora|centos|rocky|almalinux|ol|amzn|sles|opensuse) ]] || [[ "${DISTRO_LIKE}" =~ (rhel|fedora|centos) ]]; then
    PACKAGE_TYPE="rpm"
  # Check for Debian / Ubuntu / Mint / Pop
  elif [[ "${DISTRO}" =~ ^(debian|ubuntu|pop|linuxmint|kali|elementary) ]] || [[ "${DISTRO_LIKE}" =~ (debian|ubuntu) ]]; then
    PACKAGE_TYPE="deb"
  else
    PACKAGE_TYPE="appimage"
  fi

  log "Detected Linux distribution: ${BOLD}${DISTRO}${NC} (${ARCH}) -> Target package: ${BOLD}${PACKAGE_TYPE}${NC}"
elif [ "${OS}" = "Darwin" ]; then
  PACKAGE_TYPE="dmg"
  log "Detected macOS (${ARCH}) -> Target package: ${BOLD}dmg${NC}"
else
  error "Unsupported operating system: ${OS}. For Windows, run the PowerShell install script."
fi

# 2. Dynamically Resolve Latest Release Tag
log "Checking for the latest release on GitHub (https://github.com/${REPO})..."

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

# Get latest release tag directly from GitHub redirect header (avoids API rate limits)
TAG="$(curl -sIL "https://github.com/${REPO}/releases/latest" 2>/dev/null | grep -i "^location:" | head -n 1 | tr -d '\r\n' | awk -F'/' '{print $NF}' || true)"

# Fallback to GitHub API if redirect header was empty
if [ -z "${TAG}" ]; then
  RELEASE_JSON="$(curl -fsSL -H "User-Agent: ZenohX-Installer" "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)"
  if [ -n "${RELEASE_JSON}" ]; then
    TAG="$(echo "${RELEASE_JSON}" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d'"' -f4 || true)"
  fi
fi

if [ -z "${TAG}" ]; then
  error "Could not retrieve the latest release from https://github.com/${REPO}/releases.
Please make sure a release is published on GitHub."
fi

log "Found latest release: ${BOLD}${TAG}${NC}"

# Fetch release assets metadata
RELEASE_META="$(curl -fsSL -H "User-Agent: ZenohX-Installer" "https://api.github.com/repos/${REPO}/releases/tags/${TAG}" 2>/dev/null || true)"

# 3. Dynamically Locate Matching Asset Download URL
DOWNLOAD_URL=""

if [ "${PACKAGE_TYPE}" = "dmg" ]; then
  if [ "${ARCH}" = "arm64" ] || [ "${ARCH}" = "aarch64" ]; then
    DOWNLOAD_URL="$(echo "${RELEASE_META}" | grep -i -o '"browser_download_url": *"[^"]*aarch64[^"]*\.dmg"' | head -n 1 | cut -d'"' -f4 || true)"
  fi
  if [ -z "${DOWNLOAD_URL}" ]; then
    DOWNLOAD_URL="$(echo "${RELEASE_META}" | grep -i -o '"browser_download_url": *"[^"]*\.dmg"' | head -n 1 | cut -d'"' -f4 || true)"
  fi

elif [ "${PACKAGE_TYPE}" = "rpm" ]; then
  DOWNLOAD_URL="$(echo "${RELEASE_META}" | grep -i -o '"browser_download_url": *"[^"]*\.rpm"' | head -n 1 | cut -d'"' -f4 || true)"

elif [ "${PACKAGE_TYPE}" = "deb" ]; then
  DOWNLOAD_URL="$(echo "${RELEASE_META}" | grep -i -o '"browser_download_url": *"[^"]*\.deb"' | head -n 1 | cut -d'"' -f4 || true)"
fi

# Fallback to universal AppImage if specific package not found
if [ -z "${DOWNLOAD_URL}" ] && [ "${OS}" = "Linux" ]; then
  PACKAGE_TYPE="appimage"
  DOWNLOAD_URL="$(echo "${RELEASE_META}" | grep -i -o '"browser_download_url": *"[^"]*\.AppImage"' | head -n 1 | cut -d'"' -f4 || true)"
fi

# Fallback to direct latest pattern if API meta was empty
if [ -z "${DOWNLOAD_URL}" ]; then
  if [ "${PACKAGE_TYPE}" = "rpm" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/ZenohX-${TAG#v}-1.x86_64.rpm"
  elif [ "${PACKAGE_TYPE}" = "deb" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/ZenohX_${TAG#v}_amd64.deb"
  elif [ "${PACKAGE_TYPE}" = "dmg" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/ZenohX_${TAG#v}_aarch64.dmg"
  else
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/ZenohX_${TAG#v}_amd64.AppImage"
  fi
fi

FILENAME="${DOWNLOAD_URL##*/}"
DOWNLOAD_FILE="${TMP_DIR}/${FILENAME}"

log "Downloading ${FILENAME} from GitHub Releases..."
curl -fSL --progress-bar "${DOWNLOAD_URL}" -o "${DOWNLOAD_FILE}" || error "Failed to download ${FILENAME} from ${DOWNLOAD_URL}"

# 4. Perform Installation
if [ "${PACKAGE_TYPE}" = "dmg" ]; then
  log "Installing ZenohX to /Applications..."
  MOUNT_DIR="${TMP_DIR}/mount"
  mkdir -p "${MOUNT_DIR}"
  hdiutil attach "${DOWNLOAD_FILE}" -mountpoint "${MOUNT_DIR}" -quiet -nobrowse

  if [ -d "/Applications/ZenohX.app" ]; then
    rm -rf "/Applications/ZenohX.app"
  fi
  cp -R "${MOUNT_DIR}/ZenohX.app" /Applications/
  hdiutil detach "${MOUNT_DIR}" -quiet

  CLI_DIR="/usr/local/bin"
  if [ ! -w "${CLI_DIR}" ]; then
    CLI_DIR="${HOME}/.local/bin"
    mkdir -p "${CLI_DIR}"
  fi
  ln -sf "/Applications/ZenohX.app/Contents/MacOS/zenohx" "${CLI_DIR}/zenohx" 2>/dev/null || true

  success "ZenohX ${TAG} installed to /Applications/ZenohX.app!"
  success "Launch from Spotlight, Launchpad, or by typing 'zenohx' in terminal."

elif [ "${PACKAGE_TYPE}" = "rpm" ]; then
  log "Installing RPM package on ${DISTRO}..."
  INSTALLED=false

  if command -v dnf >/dev/null 2>&1; then
    if [ "$EUID" -eq 0 ]; then
      dnf install -y "${DOWNLOAD_FILE}" && INSTALLED=true
    elif command -v sudo >/dev/null 2>&1; then
      log "Running: sudo dnf install -y ${DOWNLOAD_FILE}"
      sudo dnf install -y "${DOWNLOAD_FILE}" && INSTALLED=true
    fi
  elif command -v rpm >/dev/null 2>&1; then
    if [ "$EUID" -eq 0 ]; then
      rpm -Uvh --force "${DOWNLOAD_FILE}" && INSTALLED=true
    elif command -v sudo >/dev/null 2>&1; then
      log "Running: sudo rpm -Uvh ${DOWNLOAD_FILE}"
      sudo rpm -Uvh --force "${DOWNLOAD_FILE}" && INSTALLED=true
    fi
  fi

  if [ "${INSTALLED}" = "true" ]; then
    success "ZenohX ${TAG} RPM successfully installed via package manager!"
  else
    warn "Could not obtain sudo permissions for RPM install. Falling back to local installation..."
    mkdir -p "${INSTALL_DIR_LINUX}"
    cp "${DOWNLOAD_FILE}" "${INSTALL_DIR_LINUX}/zenohx.rpm"
    success "Saved RPM to ${INSTALL_DIR_LINUX}/zenohx.rpm. Run 'sudo dnf install ${INSTALL_DIR_LINUX}/zenohx.rpm' manually."
  fi

elif [ "${PACKAGE_TYPE}" = "deb" ]; then
  log "Installing DEB package on ${DISTRO}..."
  INSTALLED=false

  if command -v apt-get >/dev/null 2>&1; then
    if [ "$EUID" -eq 0 ]; then
      apt-get install -y "${DOWNLOAD_FILE}" && INSTALLED=true
    elif command -v sudo >/dev/null 2>&1; then
      log "Running: sudo apt-get install -y ${DOWNLOAD_FILE}"
      sudo apt-get install -y "${DOWNLOAD_FILE}" && INSTALLED=true
    fi
  elif command -v dpkg >/dev/null 2>&1; then
    if [ "$EUID" -eq 0 ]; then
      dpkg -i "${DOWNLOAD_FILE}" && INSTALLED=true
    elif command -v sudo >/dev/null 2>&1; then
      log "Running: sudo dpkg -i ${DOWNLOAD_FILE}"
      sudo dpkg -i "${DOWNLOAD_FILE}" && INSTALLED=true
    fi
  fi

  if [ "${INSTALLED}" = "true" ]; then
    success "ZenohX ${TAG} DEB successfully installed via package manager!"
  else
    warn "Could not obtain sudo permissions for DEB install."
  fi

elif [ "${PACKAGE_TYPE}" = "appimage" ]; then
  mkdir -p "${INSTALL_DIR_LINUX}"
  mkdir -p "${APPLICATIONS_DIR_LINUX}"

  TARGET_BIN="${INSTALL_DIR_LINUX}/zenohx"
  cp "${DOWNLOAD_FILE}" "${TARGET_BIN}"
  chmod +x "${TARGET_BIN}"

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
  update-desktop-database "${APPLICATIONS_DIR_LINUX}" 2>/dev/null || true

  success "ZenohX ${TAG} installed to ${TARGET_BIN}"
  success "Desktop shortcut registered in Applications menu!"

  if [[ ":$PATH:" != *":${INSTALL_DIR_LINUX}:"* ]]; then
    warn "Add ~/.local/bin to your PATH in ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

log "Done! Launch ZenohX by typing 'zenohx' or from your application menu."
