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

  log "Detected Linux distribution: ${BOLD}${DISTRO}${NC} (${ARCH}) -> Preferred package: ${BOLD}${PACKAGE_TYPE}${NC}"
elif [ "${OS}" = "Darwin" ]; then
  PACKAGE_TYPE="dmg"
  log "Detected macOS (${ARCH}) -> Preferred package: ${BOLD}dmg${NC}"
else
  error "Unsupported operating system: ${OS}. For Windows, run the install.ps1 script."
fi

# 2. Query GitHub Releases API for the latest download URLs
log "Fetching latest release information from GitHub (https://github.com/${REPO})..."

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)"

if [ -n "${RELEASE_JSON}" ]; then
  TAG="$(echo "${RELEASE_JSON}" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d'"' -f4)"
else
  TAG="v0.1.0"
fi

if [ -z "${TAG}" ]; then
  TAG="v0.1.0"
fi
VERSION="${TAG#v}"

# Resolve download URL based on OS and package type
DOWNLOAD_URL=""
FILENAME=""

if [ "${PACKAGE_TYPE}" = "dmg" ]; then
  if [ "${ARCH}" = "arm64" ] || [ "${ARCH}" = "aarch64" ]; then
    FILENAME="ZenohX_aarch64.dmg"
  else
    FILENAME="ZenohX_x64.dmg"
  fi
  DOWNLOAD_URL="$(echo "${RELEASE_JSON}" | grep -o '"browser_download_url": *"[^"]*ZenohX.*\.dmg"' | head -n 1 | cut -d'"' -f4 || true)"

elif [ "${PACKAGE_TYPE}" = "rpm" ]; then
  # Look for .rpm asset matching x86_64 / amd64
  DOWNLOAD_URL="$(echo "${RELEASE_JSON}" | grep -o '"browser_download_url": *"[^"]*\.rpm"' | head -n 1 | cut -d'"' -f4 || true)"
  FILENAME="zenohx-${VERSION}-1.x86_64.rpm"

elif [ "${PACKAGE_TYPE}" = "deb" ]; then
  # Look for .deb asset matching amd64
  DOWNLOAD_URL="$(echo "${RELEASE_JSON}" | grep -o '"browser_download_url": *"[^"]*\.deb"' | head -n 1 | cut -d'"' -f4 || true)"
  FILENAME="zenohx_${VERSION}_amd64.deb"
fi

# Fallback to direct URL if API JSON parsing did not find asset
if [ -z "${DOWNLOAD_URL}" ]; then
  if [ "${PACKAGE_TYPE}" = "rpm" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${FILENAME}"
  elif [ "${PACKAGE_TYPE}" = "deb" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${FILENAME}"
  elif [ "${PACKAGE_TYPE}" = "dmg" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${FILENAME}"
  else
    FILENAME="zenohx_amd64.AppImage"
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${FILENAME}"
  fi
fi

DOWNLOAD_FILE="${TMP_DIR}/${FILENAME}"

log "Downloading ZenohX ${TAG} (${FILENAME})..."
if ! curl -fSL --progress-bar "${DOWNLOAD_URL}" -o "${DOWNLOAD_FILE}" 2>/dev/null; then
  # Try fallback to universal AppImage if specific package was not found
  if [ "${OS}" = "Linux" ] && [ "${PACKAGE_TYPE}" != "appimage" ]; then
    warn "Package ${FILENAME} not found on release. Falling back to universal AppImage..."
    PACKAGE_TYPE="appimage"
    FILENAME="zenohx_amd64.AppImage"
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${FILENAME}"
    DOWNLOAD_FILE="${TMP_DIR}/${FILENAME}"
    curl -fSL --progress-bar "${DOWNLOAD_URL}" -o "${DOWNLOAD_FILE}" || error "Failed to download ZenohX."
  else
    error "Failed to download ZenohX from ${DOWNLOAD_URL}"
  fi
fi

# 3. Perform Installation
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
    warn "Could not obtain sudo permissions for RPM install. Falling back to user directory install..."
    # Fallback to local user AppImage extraction
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

log "Done! Launch ZenohX by typing 'zenohx' or from your system applications menu."
