#!/usr/bin/env bash
#
# Compile the Deno API into a single self-contained Tauri sidecar binary.
#
# Output: apps/desktop/src-tauri/binaries/workboost-api-<host-target-triple>
# (the `-<triple>` suffix is required by Tauri's externalBin convention).
#
# Flags:
#   --unstable-cron keeps the API's Deno.cron scheduler (extensions/manager.ts registerAllCronJobs).
#     The catch-all `--unstable` is deprecated in Deno 2.0 and does NOT enable cron, so it must not be
#     used here. `--unstable-kv` is intentionally omitted: Deno #21814 makes `Deno.openKv` unavailable
#     in binaries compiled with it, and production never opens KV (only the test path does).
#   --include embeds the runtime's non-code assets (HTML apps + broker JS/CSS). `deno compile` only
#     bundles code modules by default, and packages/runtime reads these files from disk at startup
#     (seedHtmlApps/readBrokerRuntime), so without --include the sidecar fails immediately.
#   No `--env-file` is passed; provider secrets come from the shell env or a user-level
#     `~/.workboost/.env` at runtime, never from the repo bundle.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DESKTOP_DIR}/../.." && pwd)"

HOST_TRIPLE="$(rustc --print host-tuple)"
OUTPUT_NAME="workboost-api-${HOST_TRIPLE}"
OUTPUT_DIR="${DESKTOP_DIR}/src-tauri/binaries"
OUTPUT="${OUTPUT_DIR}/${OUTPUT_NAME}"

mkdir -p "${OUTPUT_DIR}"

echo "[build-api-sidecar] Compiling apps/api -> ${OUTPUT}"
# Run from the repo root so workspace imports resolve and the bundle paths mirror source paths,
# which is what `import.meta.url`-relative asset reads in packages/runtime rely on.
(
  cd "${REPO_ROOT}"
  deno compile \
    --allow-all \
    --unstable-cron \
    --no-check \
    --include "packages/runtime/src/global.js" \
    --include "packages/runtime/src/theme.css" \
    --include "packages/runtime/src/apps/debt-tracker.html" \
    --include "packages/runtime/src/apps/standup-viewer.html" \
    --output "${OUTPUT}" \
    "apps/api/src/main.ts"
)

echo "[build-api-sidecar] Done: ${OUTPUT}"
