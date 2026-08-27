// Sidecar plumbing is only compiled for bundled builds: `tauri build` enables the
// `custom-protocol` feature, `tauri dev` does not. In dev the shell points at a separately
// started `deno task dev` API instead, so a stale sidecar binary can never break startup.
use std::cmp::Ordering;
use std::sync::Arc;

use tauri::{Manager, State};

mod sidecar;
mod update;
mod watcher;
mod workspace;

/// Read-only launch check: is there a newer release? Never blocks or fails launch; returns `None`
/// on any error and never returns a URL to the webview.
#[tauri::command]
fn check_for_update(app: tauri::AppHandle) -> Result<Option<update::UpdateInfo>, String> {
    if !update::auto_update_enabled() {
        return Ok(None);
    }
    let current = app.package_info().version.to_string();
    match update::latest_release() {
        Ok(Some(info))
            if update::compare_versions(&info.version, &current) == Ordering::Greater =>
        {
            Ok(Some(info))
        }
        // On any error, an up-to-date version, or a downgrade, report no update.
        Ok(_) | Err(_) => Ok(None),
    }
}

/// Run the canonical installer elevated and relaunch. Takes NO arguments from the webview; the
/// install command is a Rust constant, so a webview XSS cannot direct the app to install anything.
#[tauri::command]
fn apply_update(app: tauri::AppHandle) -> Result<(), String> {
    run_installer()?;
    // Trigger a restart; the app relaunches into the newly installed binary on the next exit event.
    app.request_restart();
    Ok(())
}

fn run_installer() -> Result<(), String> {
    match std::env::consts::OS {
        "linux" => run_linux_installer(),
        "macos" => run_macos_installer(),
        "windows" => Err(manual_install_message("Windows")),
        other => Err(manual_install_message(other)),
    }
}

fn manual_install_message(platform: &str) -> String {
    format!(
        "{platform} updates are manual. Open the releases page to download the latest installer."
    )
}

fn command_exists(command: &str) -> bool {
    std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {command} >/dev/null 2>&1"))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn run_linux_installer() -> Result<(), String> {
    if !command_exists("pkexec") {
        return Err(manual_install_message("Linux (requires pkexec)"));
    }
    let script = format!("curl -fsSL {} | sh", update::INSTALL_URL);
    match std::process::Command::new("pkexec")
        .arg("sh")
        .arg("-c")
        .arg(&script)
        .status()
    {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("installer exited with code {:?}", status.code())),
        Err(err) => Err(format!("failed to launch pkexec: {err}")),
    }
}

fn run_macos_installer() -> Result<(), String> {
    let script = format!("curl -fsSL {} | sh", update::INSTALL_URL);
    let osascript = format!("do shell script \"{script}\" with administrator privileges");
    match std::process::Command::new("osascript")
        .arg("-e")
        .arg(&osascript)
        .status()
    {
        Ok(status) if status.success() => Ok(()),
        Ok(_) => Err("update cancelled or failed".into()),
        Err(err) => Err(format!("failed to launch osascript: {err}")),
    }
}

/// Resolved API base. Used by the legacy `resolveApiBase` bootstrap (dev-mode desktop only);
/// bundled builds use TauriDataPort which never calls this.
#[tauri::command]
fn get_api_base(state: State<'_, Arc<sidecar::SidecarManager>>) -> String {
    state.inner().base().unwrap_or_default()
}

/// Conventional port of a separately started dev API (`deno task dev` in apps/api).
#[cfg(not(feature = "custom-protocol"))]
const DEV_API_PORT: u16 = 3001;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_api_base,
            check_for_update,
            apply_update,
            sidecar::get_sidecar_status,
            sidecar::retry_sidecar,
            workspace::workspace_init,
            workspace::workspace_read_file,
            workspace::workspace_write_file,
            workspace::workspace_create_file,
            workspace::workspace_list_files,
            workspace::workspace_stat,
            workspace::workspace_move,
            workspace::workspace_remove,
            workspace::workspace_mkdir,
            workspace::workspace_exists,
        ])
        .setup(|app| {
            // Ensure workspace directories exist before the webview loads. A failure
            // here means the filesystem is unusable; fail fast so the app does not
            // start in a broken state.
            workspace::workspace_init().map_err(|e| {
                eprintln!("[workspace] init failed: {e}");
                e
            })?;

            // Start the file watcher so the webview receives workspace-changed events.
            // Best-effort: a watcher failure must not block startup.
            if let Err(e) = watcher::start_watcher(app.handle().clone()) {
                eprintln!("[workspace] watcher failed to start: {e}");
            }

            #[cfg(feature = "custom-protocol")]
            {
                // Bundled build: the webview loads immediately; the sidecar is spawned in the
                // background and reports ready/failed via Tauri events. AI features activate
                // when it is ready, but workspace editing never waits for it.
                let manager = Arc::new(sidecar::SidecarManager::starting());
                app.manage(manager.clone());
                sidecar::spawn_background(app.handle().clone(), manager);
            }

            #[cfg(not(feature = "custom-protocol"))]
            {
                // Dev build (`tauri dev`): expect the API running separately via `deno task dev`.
                // If it is not up yet, the webview surfaces connection errors and recovers once it
                // starts - no sidecar lifecycle to fight while iterating.
                app.manage(Arc::new(sidecar::SidecarManager::dev_ready(format!(
                    "http://127.0.0.1:{DEV_API_PORT}/api"
                ))));
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Work Boost desktop");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<Arc<sidecar::SidecarManager>>() {
                if let Ok(mut guard) = state.inner().child.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
