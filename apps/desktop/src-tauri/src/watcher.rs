use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::Emitter;

use crate::workspace;

/// Event payload emitted to the webview. Mirrors the server's `WorkspaceChangeEvent`.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
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

/// True if any path segment starts with `.` (hidden file/dir). Splits on both
/// separators to match the server's `split(/[\\/]+/)` dot filter.
fn is_hidden_path(rel: &Path) -> bool {
    rel.to_string_lossy()
        .split(['/', '\\'])
        .any(|part| part.starts_with('.'))
}

/// Convert raw notify events into debounced, workspace-relative batches.
///
/// Consecutive events of the same kind within `debounce` are merged into one
/// batch. The pending batch is flushed when the window expires - not only when
/// the next event arrives - so a lone external edit is always delivered.
fn debounce_loop(
    root: PathBuf,
    rx: mpsc::Receiver<notify::Result<notify::Event>>,
    mut emit: impl FnMut(WorkspaceChangeEvent),
    debounce: Duration,
) {
    let mut pending: Option<(String, Vec<String>, Instant)> = None;
    loop {
        // Block until the next event; while a batch is pending, wake up at its
        // debounce deadline so the batch can be flushed without a follow-up event.
        let received = match pending.as_ref() {
            Some((_, _, started)) => {
                let remaining = debounce.saturating_sub(started.elapsed());
                match rx.recv_timeout(remaining) {
                    Ok(Ok(event)) => Some(event),
                    Ok(Err(_)) => continue, // transient watcher error; retry the wait
                    Err(mpsc::RecvTimeoutError::Timeout) => None,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
            None => match rx.recv() {
                Ok(Ok(event)) => Some(event),
                Ok(Err(_)) => continue,
                Err(_) => break, // channel closed -> watcher dropped
            },
        };

        let Some(event) = received else {
            // Debounce window expired: emit the batch.
            if let Some((kind, paths, _)) = pending.take() {
                emit(WorkspaceChangeEvent { paths, kind });
            }
            continue;
        };

        let Some(kind) = map_event_kind(event.kind) else {
            continue;
        };

        // Convert absolute paths to workspace-relative, filtering dot segments.
        // Separators are normalized to `/` because the webview splits paths on `/`.
        let rel_paths: Vec<String> = event
            .paths
            .iter()
            .filter_map(|p| p.strip_prefix(&root).ok())
            .filter(|p| !is_hidden_path(p))
            .map(workspace::rel_path_string)
            .collect();
        if rel_paths.is_empty() {
            continue;
        }

        // Flush pending batch if it's a different kind or the debounce window expired.
        if let Some((ref mut pending_kind, ref mut paths, ref mut started)) = pending {
            if *pending_kind != kind || started.elapsed() >= debounce {
                emit(WorkspaceChangeEvent {
                    paths: std::mem::take(paths),
                    kind: std::mem::take(pending_kind),
                });
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
        emit(WorkspaceChangeEvent { paths, kind });
    }
}

/// Debounce window for batching same-kind watcher events.
const DEBOUNCE_MS: Duration = Duration::from_millis(100);

/// Start a recursive watcher on `root`, debouncing events through `emit`.
/// The spawned thread owns the watcher: if it were dropped when this function
/// returned, the event channel would close and delivery would stop immediately.
fn spawn_watcher<F>(root: PathBuf, emit: F) -> Result<(), String>
where
    F: FnMut(WorkspaceChangeEvent) + Send + 'static,
{
    if !root.exists() {
        return Err("Workspace root does not exist; call workspace_init first".into());
    }
    // Canonicalize so backend-reported paths (some backends canonicalize,
    // e.g. FSEvents) still strip cleanly against the watched root.
    let root = root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace root: {e}"))?;

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();

    let mut watcher: RecommendedWatcher = notify::recommended_watcher(tx)
        .map_err(|e| format!("Failed to create watcher: {e}"))?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch workspace: {e}"))?;

    std::thread::spawn(move || {
        let _watcher = watcher;
        debounce_loop(root, rx, emit, DEBOUNCE_MS);
    });

    Ok(())
}

/// Start a recursive file watcher on the workspace root. Emits Tauri `workspace-changed`
/// events with debounced, workspace-relative paths matching the server's watcher semantics.
///
/// Debounce window: 100ms. Events of the same kind within that window are batched.
/// The watcher is owned by its debounce thread and lives for the process lifetime.
pub fn start_watcher(app: tauri::AppHandle) -> Result<(), String> {
    spawn_watcher(workspace::workspace_root(), move |event| {
        let _ = app.emit("workspace-changed", event);
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{
        AccessKind, CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode,
    };
    use notify::EventKind;
    use std::sync::{Arc, Mutex};

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "workboost-watcher-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn raw_event(kind: EventKind, paths: Vec<PathBuf>) -> notify::Result<notify::Event> {
        Ok(notify::Event {
            kind,
            paths,
            attrs: Default::default(),
        })
    }

    fn create_event(paths: Vec<PathBuf>) -> notify::Result<notify::Event> {
        raw_event(EventKind::Create(CreateKind::File), paths)
    }

    /// Spawn `debounce_loop` with a collector, returning the shared sink and sender.
    fn spawn_loop(
        root: PathBuf,
        debounce: Duration,
    ) -> (
        Arc<Mutex<Vec<WorkspaceChangeEvent>>>,
        mpsc::Sender<notify::Result<notify::Event>>,
    ) {
        let (tx, rx) = mpsc::channel();
        let emitted = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&emitted);
        std::thread::spawn(move || {
            debounce_loop(root, rx, |event| sink.lock().unwrap().push(event), debounce);
        });
        (emitted, tx)
    }

    /// Poll until `count` events land, or panic after `timeout`.
    fn wait_for_events(
        sink: &Arc<Mutex<Vec<WorkspaceChangeEvent>>>,
        count: usize,
        timeout: Duration,
    ) -> Vec<WorkspaceChangeEvent> {
        let deadline = Instant::now() + timeout;
        loop {
            let events = sink.lock().unwrap().clone();
            if events.len() >= count {
                return events;
            }
            assert!(
                Instant::now() < deadline,
                "timed out waiting for {count} event(s), got: {events:?}"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn map_event_kind_matches_server_kinds() {
        assert_eq!(
            map_event_kind(EventKind::Create(CreateKind::File)),
            Some("create".into())
        );
        assert_eq!(
            map_event_kind(EventKind::Modify(ModifyKind::Name(RenameMode::Both))),
            Some("rename".into())
        );
        assert_eq!(
            map_event_kind(EventKind::Modify(ModifyKind::Data(DataChange::Any))),
            Some("modify".into())
        );
        assert_eq!(
            map_event_kind(EventKind::Remove(RemoveKind::File)),
            Some("remove".into())
        );
        assert_eq!(
            map_event_kind(EventKind::Access(AccessKind::Read)),
            None
        );
        assert_eq!(map_event_kind(EventKind::Any), None);
    }

    #[test]
    fn flushes_pending_batch_without_followup_event() {
        let root = temp_root("flush");
        let (sink, tx) = spawn_loop(root.clone(), Duration::from_millis(100));
        tx.send(create_event(vec![root.join("daily/a.md")])).unwrap();

        // No second event arrives: the batch must still be emitted when the
        // debounce window expires.
        let events = wait_for_events(&sink, 1, Duration::from_secs(2));
        assert_eq!(events[0].kind, "create");
        assert_eq!(events[0].paths, vec!["daily/a.md".to_string()]);
    }

    #[test]
    fn merges_same_kind_events_within_window() {
        let root = temp_root("merge");
        let (sink, tx) = spawn_loop(root.clone(), Duration::from_millis(400));
        tx.send(create_event(vec![root.join("a.md")])).unwrap();
        tx.send(create_event(vec![root.join("b.md")])).unwrap();

        let events = wait_for_events(&sink, 1, Duration::from_secs(2));
        // One merged batch with both paths...
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].paths, vec!["a.md".to_string(), "b.md".to_string()]);
        // ...and no second batch once the window is well past.
        std::thread::sleep(Duration::from_millis(600));
        assert_eq!(sink.lock().unwrap().len(), 1);
    }

    #[test]
    fn separates_batches_of_different_kinds() {
        let root = temp_root("kinds");
        let (sink, tx) = spawn_loop(root.clone(), Duration::from_millis(400));
        tx.send(create_event(vec![root.join("a.md")])).unwrap();
        tx.send(raw_event(
            EventKind::Remove(RemoveKind::File),
            vec![root.join("b.md")],
        ))
        .unwrap();

        let events = wait_for_events(&sink, 2, Duration::from_secs(2));
        assert_eq!(events[0].kind, "create");
        assert_eq!(events[0].paths, vec!["a.md".to_string()]);
        assert_eq!(events[1].kind, "remove");
        assert_eq!(events[1].paths, vec!["b.md".to_string()]);
    }

    #[test]
    fn filters_hidden_paths_and_normalizes_separators() {
        let root = temp_root("hidden");
        let (sink, tx) = spawn_loop(root.clone(), Duration::from_millis(100));
        tx.send(create_event(vec![root.join(".workboost/trash/x.json")])).unwrap();
        tx.send(create_event(vec![root.join("notes/a.md")])).unwrap();

        // Only the non-hidden path is delivered.
        let events = wait_for_events(&sink, 1, Duration::from_secs(2));
        assert_eq!(events[0].paths, vec!["notes/a.md".to_string()]);
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(sink.lock().unwrap().len(), 1, "hidden path leaked: {sink:?}");
    }

    #[test]
    fn real_watcher_stays_alive_and_delivers_events() {
        // Regression test: the watcher must be owned by the debounce thread.
        // If it were dropped when spawn_watcher returned, the channel would
        // close and no event would ever be delivered.
        let root = temp_root("real");
        std::fs::create_dir_all(root.join("daily")).unwrap();
        let (event_tx, event_rx) = std::sync::mpsc::channel::<WorkspaceChangeEvent>();
        spawn_watcher(root.clone(), move |event| {
            let _ = event_tx.send(event);
        })
        .unwrap();

        // Give the backend a moment to register the watch before writing.
        std::thread::sleep(Duration::from_millis(300));
        std::fs::write(root.join("daily/a.md"), "# hi").unwrap();

        let event = event_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("watcher delivered no event for a new file");
        assert_eq!(event.kind, "create");
        assert!(event.paths.iter().any(|p| p == "daily/a.md"));
    }
}
