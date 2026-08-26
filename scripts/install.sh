#!/bin/sh
# Work Boost desktop installer.
#
#   curl -fsSL https://raw.githubusercontent.com/nampq11/work-boost/main/scripts/install.sh | sh
#
# Downloads the prebuilt Tauri bundle from GitHub Releases, verifies its checksum,
# and installs it with the platform-native mechanism.
set -e

GITHUB_API="https://api.github.com/repos/nampq11/work-boost/releases/latest"
RELEASES_URL="https://github.com/nampq11/work-boost/releases/latest"

log() {
  printf '[install] %s\n' "$1"
}

fail() {
  printf '[install] ERROR: %s\n' "$1" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required but not installed"

OS=$(uname -s)
ARCH=$(uname -m)

case "$ARCH" in
  x86_64|amd64) TAURI_ARCH="amd64" ;;
  aarch64|arm64) TAURI_ARCH="aarch64" ;;
  *) fail "unsupported architecture: $ARCH" ;;
esac

case "$OS" in
  Linux) ASSET_PATTERN="_${TAURI_ARCH}.deb$" ;;
  Darwin) ASSET_PATTERN="_${TAURI_ARCH}.dmg$" ;;
  *) fail "no prebuilt desktop bundle for your platform ($OS). Windows users should download the .msi from $RELEASES_URL" ;;
esac

log "resolving latest release from GitHub"
RELEASE_JSON=$(curl -fsSL "$GITHUB_API") || fail "could not reach GitHub Releases - is the repository public and has it published a release?"
DOWNLOAD_URL=$(printf '%s' "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"/\1/' | grep -E "$ASSET_PATTERN" | head -1)
[ -n "$DOWNLOAD_URL" ] || fail "no desktop bundle matching $ASSET_PATTERN found in the latest release"
# checksum files are uploaded next to bundles with a .sha256 suffix on the same name
CHECKSUM_URL="$DOWNLOAD_URL.sha256"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
ARTIFACT="$TMP_DIR/${DOWNLOAD_URL##*/}"
CHECKSUM_FILE="$ARTIFACT.sha256"

log "downloading $(basename "$ARTIFACT")"
curl -fL "$DOWNLOAD_URL" -o "$ARTIFACT" || fail "download failed"
if curl -fsL "$CHECKSUM_URL" -o "$CHECKSUM_FILE"; then
  ( cd "$TMP_DIR" && sha256sum -c "$(basename "$CHECKSUM_FILE")" >/dev/null ) \
    || fail "checksum verification failed for $(basename "$ARTIFACT")"
  log "checksum verified"
else
  log "WARNING: no checksum file published for this release, skipping verification"
fi

case "$OS" in
  Linux)
    if command -v apt-get >/dev/null 2>&1; then
      log "installing .deb package (may ask for your password)"
      sudo dpkg -i "$ARTIFACT" || sudo apt-get install -f -y || fail "dpkg install failed"
    else
      INSTALL_PATH="${HOME}/Applications/$(basename "$ARTIFACT")"
      mkdir -p "${HOME}/Applications"
      mv "$ARTIFACT" "$INSTALL_PATH"
      chmod +x "$INSTALL_PATH"
      log "no apt-get found; moved bundle to $INSTALL_PATH - run it directly or integrate with your package manager"
    fi
    ;;
  Darwin)
    MOUNT_DIR="$TMP_DIR/mount"
    hdiutil attach "$ARTIFACT" -mountpoint "$MOUNT_DIR" -quiet || fail "could not mount .dmg"
    APP_PATH=$(find "$MOUNT_DIR" -maxdepth 1 -name '*.app' | head -1)
    [ -n "$APP_PATH" ] || { hdiutil detach "$MOUNT_DIR" -quiet; fail "no .app found inside .dmg"; }
    log "copying $(basename "$APP_PATH") to /Applications"
    rm -rf "/Applications/$(basename "$APP_PATH")"
    cp -R "$APP_PATH" /Applications/
    hdiutil detach "$MOUNT_DIR" -quiet
    ;;
esac

log "desktop version installed. launch Work Boost from your applications menu"
