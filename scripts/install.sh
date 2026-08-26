#!/bin/sh
# Work Boost installer.
#
# CLI install (source + Deno):
#   curl -fsSL https://raw.githubusercontent.com/nampq11/work-boost/main/scripts/install.sh | sh
#   ... | sh -s -- --dir /path/to/install          (default: ~/.workboost)
#
# Desktop install (prebuilt Tauri bundle from GitHub Releases):
#   ... | sh -s -- --desktop
set -e

REPO_URL="https://github.com/nampq11/work-boost.git"
GITHUB_API="https://api.github.com/repos/nampq11/work-boost/releases/latest"
INSTALL_DIR="${WORKBOOST_INSTALL_DIR:-$HOME/.workboost}"
BRANCH="main"

log() {
  printf '[install] %s\n' "$1"
}

fail() {
  printf '[install] ERROR: %s\n' "$1" >&2
  exit 1
}

# True when a deno >= 2 is on PATH (the app needs unstable-kv and unstable-cron)
recent_deno_available() {
  command -v deno >/dev/null 2>&1 || return 1
  [ "$(deno --version | head -1 | awk '{print $2}' | cut -d. -f1)" -ge 2 ]
}

install_deno() {
  log "deno not found or older than the required 2.x, running official installer"
  curl -fsSL https://deno.land/install.sh | sh
  export PATH="$HOME/.deno/bin:$PATH"
}

# Parse arguments passed via "sh -s --" or direct invocation
MODE="cli"
while [ $# -gt 0 ]; do
  case "$1" in
    --desktop)
      MODE="desktop"
      shift
      ;;
    --dir)
      [ -n "${2:-}" ] || fail "--dir requires a value"
      INSTALL_DIR="$2"
      shift 2
      ;;
    *)
      fail "unknown argument: $1 (usage: install.sh [--desktop] [--dir PATH])"
      ;;
  esac
done

command -v curl >/dev/null 2>&1 || fail "curl is required but not installed"

install_desktop() {
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
    *) fail "no prebuilt desktop bundle for your platform ($OS). Windows users should download the .msi from https://github.com/nampq11/work-boost/releases/latest" ;;
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
}

if [ "$MODE" = "desktop" ]; then
  install_desktop
  exit 0
fi

# ---- CLI (source) install path ----

command -v git >/dev/null 2>&1 || fail "git is required but not installed"

if [ -d "$INSTALL_DIR/.git" ]; then
  log "existing installation found at $INSTALL_DIR, pulling latest changes"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  log "cloning Work Boost into $INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

if recent_deno_available; then
  log "found deno $(deno --version | head -1)"
else
  install_deno
fi

command -v deno >/dev/null 2>&1 || {
  log "deno was installed to ~/.deno/bin but is not on this shell's PATH yet"
  log "add this to your shell profile: export PATH=\"\$HOME/.deno/bin:\$PATH\""
}

cd "$INSTALL_DIR"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  log "created .env from .env.example - edit it before starting the server"
fi

log "done. next steps:"
printf '  cd %s\n' "$INSTALL_DIR"
printf '  edit .env            # AI provider keys, Slack/Telegram tokens (all optional)\n'
printf '  deno task start      # start API on http://localhost:3001\n'
printf '  deno task dev        # or run in watch mode during development\n'
