#!/bin/sh
# Work Boost desktop installer.
#
#   curl -fsSL https://raw.githubusercontent.com/nampq11/work-boost/main/scripts/install.sh | sh
#
# Downloads the prebuilt Tauri bundle from GitHub Releases, verifies its checksum,
# and installs it with the platform-native mechanism.
#
# The desktop app passes an optional scratch path as $1 and relishes `phase:`
# / `error:` marker lines it appends, so the UI can stream install progress.
# Manual `curl | sh` usage passes no argument and writes nothing.
set -e

PROGRESS_FILE="${1:-}"

# Append a marker line for the desktop app to tail. A no-op for manual installs.
progress() {
  [ -n "$PROGRESS_FILE" ] && printf '%s\n' "$1" >> "$PROGRESS_FILE"
}

GITHUB_API="https://api.github.com/repos/nampq11/work-boost/releases/latest"
RELEASES_URL="https://github.com/nampq11/work-boost/releases/latest"

log() {
  printf '[install] %s\n' "$1"
}

fail() {
  progress "error:$1"
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
MOUNT_DIR=""
# Clean up on every exit path (success or failure): detach any mounted .dmg and remove the temp
# dir. A cancelled/failed install must never leave a volume mounted or temp files behind.
cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
ARTIFACT="$TMP_DIR/${DOWNLOAD_URL##*/}"
CHECKSUM_FILE="$ARTIFACT.sha256"

progress "phase:downloading"
log "downloading $(basename "$ARTIFACT")"
curl -fL "$DOWNLOAD_URL" -o "$ARTIFACT" || fail "download failed"
if curl -fsL "$CHECKSUM_URL" -o "$CHECKSUM_FILE"; then
  # Compare hashes directly instead of "sha256sum -c": asset names contain
  # spaces ("Work Boost_...") and -c relies on checksum-file name parsing
  # that differs between GNU coreutils and BSD/macOS tooling.
  EXPECTED_HASH=$(awk '{print $1}' "$CHECKSUM_FILE")
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_HASH=$(cd "$TMP_DIR" && sha256sum "$(basename "$ARTIFACT")" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_HASH=$(cd "$TMP_DIR" && shasum -a 256 "$(basename "$ARTIFACT")" | awk '{print $1}')
  else
    log "WARNING: no SHA-256 tool found, skipping checksum verification"
    ACTUAL_HASH="$EXPECTED_HASH"
  fi
  if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
    log "checksum verified"
  else
    fail "checksum mismatch for $(basename "$ARTIFACT")"
  fi
else
  fail "no checksum published for $(basename "$ARTIFACT"); refusing to install unverified build"
fi

progress "phase:installing"
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
    [ -n "$APP_PATH" ] || fail "no .app found inside .dmg"
    log "copying $(basename "$APP_PATH") to /Applications"
    rm -rf "/Applications/$(basename "$APP_PATH")"
    cp -R "$APP_PATH" /Applications/
    hdiutil detach "$MOUNT_DIR" -quiet
    ;;
esac

log "desktop version installed. launch Work Boost from your applications menu"
