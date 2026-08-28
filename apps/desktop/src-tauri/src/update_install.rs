//! Elevated installer orchestration with live phase feedback.
//!
//! The webview calls `apply_update`, which delegates here. We run the canonical
//! installer (`scripts/install.sh`) elevated, and stream the user through the
//! phases of the install (`waiting-permission` -> `downloading` -> `installing`
//! -> `restarting`) so the app does not look stuck while it stays open.
//!
//! The canonical installer only streams output when run on a terminal, and the
//! elevated wrapper (`pkexec`/`osascript`) buffers or rewrites it, so phase
//! progress is relayed out-of-band: the app passes the script a scratch file
//! path as `$1` and `scripts/install.sh` appends `phase:<name>` (and
//! `error:<message>` on failure) markers to it. A background thread tails that
//! file and emits Tauri `update:phase` / `update:error` events to the webview.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use crate::update;

/// Lifecycle phase of an in-progress update, surfaced to the webview verbatim.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdatePhase {
    WaitingPermission,
    Downloading,
    Installing,
    Restarting,
    Failed,
}

/// Map a `phase:` marker line from the installer to a [`UpdatePhase`].
/// Unknown phases are ignored so the installer can evolve without breaking the app.
fn parse_phase_marker(line: &str) -> Option<UpdatePhase> {
    let phase = line.strip_prefix("phase:")?;
    match phase {
        "downloading" => Some(UpdatePhase::Downloading),
        "installing" => Some(UpdatePhase::Installing),
        _ => None,
    }
}

/// Map an `error:` marker line from the installer to its message.
fn parse_error_marker(line: &str) -> Option<String> {
    line.strip_prefix("error:").map(str::to_string)
}

/// Read the last `error:` marker written by the installer, if any. The script
/// writes the most specific failure message (download failed, checksum mismatch,
/// cancelled auth) before exiting non-zero.
fn read_last_error(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    text.lines().filter_map(parse_error_marker).next_back()
}

fn emit_phase(app: &AppHandle, phase: UpdatePhase) {
    let _ = app.emit("update:phase", serde_json::json!({ "phase": phase }));
}

/// Emit the terminal failure phase and the specific error message.
fn emit_failure(app: &AppHandle, message: &str) {
    emit_phase(app, UpdatePhase::Failed);
    let _ = app.emit("update:error", serde_json::json!({ "message": message }));
}

/// A unique scratch path for the installer to append progress markers to.
/// Lives in the shared temp dir so both the (non-elevated) app and the elevated
/// child process can read/write it; the pid + nanosecond suffix keeps concurrent
/// update attempts from colliding.
fn temp_progress_path() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("workboost-update-{}-{nanos}.txt", std::process::id()))
}

/// Tail the progress file, emitting `update:phase` / `update:error` events as the
/// installer appends markers. Stops on `stop` (set once the installer exits) and
/// only ever processes complete lines so a torn trailing write is retried.
fn spawn_progress_tailer(
    app: AppHandle,
    path: PathBuf,
    stop: Arc<AtomicBool>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut consumed: usize = 0;
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(bytes) = std::fs::read(&path) {
                let mut pos = consumed;
                // Advance only past lines terminated by a newline; a partial tail
                // is left for a later poll once the writer finishes it.
                while let Some(rel) = bytes[pos..].iter().position(|&b| b == b'\n') {
                    let line_end = pos + rel;
                    let line = String::from_utf8_lossy(&bytes[pos..line_end]);
                    if let Some(phase) = parse_phase_marker(&line) {
                        emit_phase(&app, phase);
                    } else if let Some(message) = parse_error_marker(&line) {
                        emit_failure(&app, &message);
                    }
                    pos = line_end + 1;
                }
                consumed = pos;
            }
            std::thread::sleep(Duration::from_millis(150));
        }
    })
}

fn run_platform_installer(progress_path: &Path) -> Result<(), String> {
    match std::env::consts::OS {
        "linux" => run_linux_installer(progress_path),
        "macos" => run_macos_installer(progress_path),
        other => Err(manual_install_message(other)),
    }
}

/// Run the installer and relay phase progress to the webview. Blocks until the
/// installer exits; call from a spawned background thread so the IPC command
/// returns immediately.
fn run_installer(app: &AppHandle) -> Result<(), String> {
    let progress_path = temp_progress_path();
    if let Err(e) = std::fs::write(&progress_path, b"") {
        let message = format!("could not create update progress file: {e}");
        emit_failure(app, &message);
        return Err(message);
    }
    emit_phase(app, UpdatePhase::WaitingPermission);

    let stop = Arc::new(AtomicBool::new(false));
    let tailer = spawn_progress_tailer(app.clone(), progress_path.clone(), Arc::clone(&stop));

    let result = run_platform_installer(&progress_path);

    stop.store(true, Ordering::Relaxed);
    let _ = tailer.join();
    let message = read_last_error(&progress_path);
    let _ = std::fs::remove_file(&progress_path);

    match result {
        Ok(()) => {
            emit_phase(app, UpdatePhase::Restarting);
            // Relaunch into the newly installed binary on the next exit event.
            app.request_restart();
            Ok(())
        }
        Err(process_error) => {
            // Prefer the installer's own specific message when it reported one.
            let message = message.unwrap_or(process_error);
            emit_failure(app, &message);
            Err(message)
        }
    }
}

/// Entry point for the `apply_update` IPC command. Rejects platforms that cannot
/// auto-update, then runs the installer on a background thread and returns:
/// phases, success/restart, and failures are all delivered as Tauri events.
pub fn start_install(app: AppHandle) -> Result<(), String> {
    match std::env::consts::OS {
        "linux" | "macos" => {}
        other => return Err(manual_install_message(other)),
    }
    std::thread::spawn(move || {
        if let Err(e) = run_installer(&app) {
            eprintln!("[update] install error: {e}");
        }
    });
    Ok(())
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

fn run_linux_installer(progress_path: &Path) -> Result<(), String> {
    if !command_exists("pkexec") {
        return Err(manual_install_message("Linux (requires pkexec)"));
    }
    // `sh -s -- <path>` reads the piped script from stdin while exposing the path
    // as `$1`, so the elevated child appends progress markers to the file.
    let script = format!(
        "curl -fsSL {} | sh -s -- {}",
        update::INSTALL_URL,
        progress_path.display()
    );
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

fn run_macos_installer(progress_path: &Path) -> Result<(), String> {
    let script = format!(
        "curl -fsSL {} | sh -s -- {}",
        update::INSTALL_URL,
        progress_path.display()
    );
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_phase_markers() {
        assert_eq!(parse_phase_marker("phase:downloading"), Some(UpdatePhase::Downloading));
        assert_eq!(parse_phase_marker("phase:installing"), Some(UpdatePhase::Installing));
    }

    #[test]
    fn ignores_unknown_phase_markers() {
        assert_eq!(parse_phase_marker("phase:done"), None);
        assert_eq!(parse_phase_marker("phase:not-a-phase"), None);
        assert_eq!(parse_phase_marker("[install] downloading"), None);
        assert_eq!(parse_phase_marker("downloading"), None);
    }

    #[test]
    fn parses_error_markers() {
        assert_eq!(
            parse_error_marker("error:download failed"),
            Some("download failed".to_string())
        );
        assert_eq!(parse_error_marker("error:"), Some(String::new()));
        assert_eq!(parse_error_marker("ERROR: download failed"), None);
        assert_eq!(parse_error_marker("phase:installing"), None);
    }

    #[test]
    fn reads_last_error_from_progress_file() {
        let path = temp_progress_path();
        std::fs::write(
            &path,
            "phase:downloading\nerror:checksum mismatch for pkg.deb\nphase:installing\n",
        )
        .unwrap();
        assert_eq!(
            read_last_error(&path),
            Some("checksum mismatch for pkg.deb".to_string())
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn no_error_when_success_file() {
        let path = temp_progress_path();
        std::fs::write(&path, "phase:downloading\nphase:installing\n").unwrap();
        assert_eq!(read_last_error(&path), None);
        let _ = std::fs::remove_file(&path);
    }
}
