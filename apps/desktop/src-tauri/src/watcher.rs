use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::Emitter;

use crate::workspace;

/// Event payload emitted to the webview. Mirrors the server's `WorkspaceChangeEvent`.
#[derive(Serialize, Clone)]
pub struct WorkspaceChangeEvent {
    pub paths: Vec<String>,
    pub kind: String,
}

/// Map a `notify::EventKind` to the server's allowed event kinds.
/// The server only forwards {create, modify, remove, rename}.
fn map_event_kind(kind: notify::EventKind) -> Option<String> {
    use notify::event::ModifyKind;
    use notify::EventKind;
    let mapped = match kind {
        EventKind::Create(_) => "create",
        // A rename is a name modification; notify exposes it as Modify(Name(...)).
        EventKind::Modify(ModifyKind::Name(_)) => "rename",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "remove",
        EventKind::Any | EventKind::Access(_) | EventKind::Other => return None,
    };
    Some(mapped.to_string())
}

/// Start a recursive file watcher on the workspace root. Emits Tauri `workspace-changed`
/// events with debounced, workspace-relative paths matching the server's watcher semantics.
///
/// Debounce window: 100ms. Events of the same kind within that window are batched.
pub fn start_watcher(app: tauri::AppHandle) -> Result<(), String> {
    let root = workspace::workspace_root();
    if !root.exists() {
        return Err("Workspace root does not exist; call workspace_init first".into());
    }

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();

    let mut watcher: RecommendedWatcher = notify::recommended_watcher(tx)
        .map_err(|e| format!("Failed to create watcher: {e}"))?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch workspace: {e}"))?;

    std::thread::spawn(move || {
        const DEBOUNCE_MS: Duration = Duration::from_millis(100);
        let mut pending: Option<(String, Vec<String>, Instant)> = None;

        loop {
            let event = match rx.recv() {
                Ok(Ok(event)) => event,
                Ok(Err(_)) => continue,
                Err(_) => break, // channel closed -> watcher dropped
            };

            let Some(kind) = map_event_kind(event.kind) else {
                continue;
            };

            // Convert absolute paths to workspace-relative, filtering dot segments.
            let rel_paths: Vec<String> = event
                .paths
                .iter()
                .filter_map(|p| p.strip_prefix(&root).ok())
                .filter(|p| !p.to_string_lossy().split('/').any(|part| part.starts_with('.')))
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if rel_paths.is_empty() {
                continue;
            }

            // Flush pending batch if it's a different kind or the debounce window expired.
            if let Some((ref mut pending_kind, ref mut paths, ref mut started)) = pending {
                if *pending_kind != kind || started.elapsed() >= DEBOUNCE_MS {
                    let _ = app.emit(
                        "workspace-changed",
                        WorkspaceChangeEvent {
                            paths: paths.clone(),
                            kind: pending_kind.clone(),
                        },
                    );
                    *paths = rel_paths;
                    *pending_kind = kind;
                    *started = Instant::now();
                } else {
                    // Same kind, within window: merge paths.
                    for p in rel_paths {
                        if !paths.contains(&p) {
                            paths.push(p);
                        }
                    }
                }
            } else {
                pending = Some((kind, rel_paths, Instant::now()));
            }
        }

        // Flush any remaining batch on shutdown.
        if let Some((kind, paths, _)) = pending.take() {
            let _ = app.emit("workspace-changed", WorkspaceChangeEvent { paths, kind });
        }
    });

    Ok(())
}