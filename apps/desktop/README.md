# Work Boost Desktop (Tauri 2)

A native desktop shell for Work Boost. It wraps the existing Vite + React frontend
(`apps/web`) in a Tauri 2 window and runs the existing Deno API (`apps/api`) as a bundled
sidecar on a loopback port. The API remains the source of truth for the Markdown workspace
and OAuth (ADR 0008).

## Layout

```text
apps/desktop/
├── package.json                # convenience scripts (dev/build/check)
├── deno.json                   # workspace member registration (type-checks build scripts)
├── scripts/
│   └── build-api-sidecar.ts    # compile apps/api into src-tauri/binaries/workboost-api-<triple>
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json         # devUrl + frontendDist, scoped CSP, externalBin
    ├── capabilities/default.json
    ├── icons/                  # generated via `tauri icon`
    ├── src/
    │   ├── main.rs
    │   └── lib.rs              # spawn/kill sidecar, get_api_base command
    └── binaries/               # build output (gitignored)
```

## Prerequisites

- Rust toolchain (`rustup`, stable). `rustc --print host-tuple` gives the sidecar target triple.
- Deno (any recent 2.x). The API is compiled with `deno compile`.
- The Tauri CLI. Use `npx @tauri-apps/cli` (no global install required) or `cargo install tauri-cli`.
- Linux build needs the webview system libraries: `webkit2gtk-4.1`, `gtk3`, `libsoup3`,
  `libappindicator` (Dev/`-dev` packages). macOS/Windows have their own bundled webviews.

## Build & run

```sh
# Terminal 1: start the API on the conventional dev port (3001)
deno task dev

# Terminal 2: starts Vite and opens the shell in a native window pointing at that API
cd apps/desktop && npm run dev

# Production: rebuilds the sidecar, builds the frontend + Rust shell, bundles the installer
cd apps/desktop && npm run build
```

In dev the shell does not spawn the sidecar (`tauri dev` disables the `custom-protocol` feature);
it points at `http://127.0.0.1:3001`, so a stale sidecar binary can never break startup.
`npm run build` forces a fresh sidecar compile via `build:api -- --force` before `tauri build`
(the bundled build spawns the sidecar itself; no separate terminal).

## Notes

- **Sidecar binding**: the API sidecar always binds `127.0.0.1:<port>` (passed via
  `WORKBOOST_HOST`/`WORKBOOST_PORT`). It must not bind `0.0.0.0`; `/auth`, `/v1`, and `/message`
  routes are not loopback-gated.
- **Runtime API base**: the webview calls the `get_api_base()` Tauri command at startup and uses the
  returned loopback URL. Outside Tauri (browser dev, tests) it falls back to `VITE_API_BASE`/the
  default. The API base is applied before the first request (React renders a "connecting" state).
- **Secrets**: the sidecar has no bundled `.env`. Provider keys come from the shell env or a user-level
  `~/.workboost/.env`. `.workboost/config.json` only holds non-secret AI provider/model. Never bundle
  credentials.
- **Compile flags**: `deno compile` uses `--unstable-cron` (for `Deno.cron`; the catch-all `--unstable`
  was removed in Deno 2.0) and `--include` for the runtime's non-code assets (HTML apps + broker
  JS/CSS). `--unstable-kv` is omitted (Deno #21814 breaks KV in compiled binaries; production never
  opens KV).
- **Bundle size**: the sidecar embeds the npm dependency tree (~700 MB of `node_modules`), so the
  resulting bundle is large. Trim dependencies or move extensions off the npm path to shrink it.

## Capabilities

The webview permission set is intentionally minimal: `core:default` + `opener:default` (the latter for
opening OAuth URLs in the system browser). No `shell:*` (the sidecar is spawned only from Rust) and no
`fs` scope (the API owns workspace persistence).
