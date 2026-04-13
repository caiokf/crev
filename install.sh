#!/bin/sh
set -e

REPO="caiokf/crev"

# Detect OS
OS=$(uname -s)
case "$OS" in
  Linux)  OS="linux" ;;
  Darwin) OS="darwin" ;;
  *)      echo "Unsupported OS: $OS"; exit 1 ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)       ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)            echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Allow overrides
VERSION="${CREV_VERSION:-latest}"
INSTALL_DIR="${CREV_INSTALL_DIR:-$HOME/.local/bin}"

# Resolve latest version
if [ "$VERSION" = "latest" ]; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
  if [ -z "$VERSION" ]; then
    echo "Failed to fetch latest version"
    exit 1
  fi
fi

ARTIFACT="crev-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARTIFACT}"

echo "Installing crev ${VERSION} (${OS}/${ARCH})..."

mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" -o "${INSTALL_DIR}/crev"
chmod +x "${INSTALL_DIR}/crev"

echo "Installed crev to ${INSTALL_DIR}/crev"

# Check if install dir is in PATH
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo ""
    echo "Add to your PATH:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo ""
    echo "Or add that line to your shell profile (~/.bashrc, ~/.zshrc, etc.)"
    ;;
esac
