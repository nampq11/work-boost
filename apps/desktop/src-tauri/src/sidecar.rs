// Sidecar lifecycle: spawns the Deno API sidecar asynchronously (bundled builds only)
// so the webview loads immediately and AI features activate when the sidecar is ready.
// Dev builds never spawn a sidecar; they set `Ready` pointing at the separately started
// `deno task dev` API on port 3001.
use std::sync::{Arc, Mutex};
#[cfg(feature = "custom-protocol")]
use std::time::{Duration, Instant};
use tauri::Emitter;
#[cfg(feature = "custom-protocol")]
use tauri_plugin_shell::ShellExt;

/// Lifecycle state of the API sidecar, shared between the main thread and the
/// background spawn thread.
#[derive(Clone)]
#[cfg_attr(not(feature = "custom-protocol"), allow(dead_code))]
pub enum SidecarState {
    Starting,
    Ready { base: String },
    #[allow(dead_code)]
    Failed { error: String },
}

impl SidecarState {
    fn to_payload(&self) -> serde_json::Value {
        match self {
            SidecarState::Starting => serde_json::json!({ "state": "starting" }),
            SidecarState::Ready { base } => serde_json::json!({ "state": "ready", "base": base }),
            SidecarState::Failed { error } => serde_json::json!({
                "state": "failed",
                "error": error,
                "retryable": true,
            }),
        }
    }
}

/// Holds the shared sidecar state and the child handle so it can be killed on exit.
pub struct SidecarManager {
    pub state: Arc<Mutex<SidecarState>>,
    pub child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

#[allow(dead_code)]
impl SidecarManager {
    /// Dev build: no sidecar, point at the separately started dev API.
    pub fn dev_ready(base: String) -> Self {
        SidecarManager {
            state: Arc::new(Mutex::new(SidecarState::Ready { base })),
            child: Mutex::new(None),
        }
    }

    /// Bundled build: start in `Starting`, spawn the sidecar in the background.
    pub fn starting() -> Self {
        SidecarManager {
            state: Arc::new(Mutex::new(SidecarState::Starting)),
            child: Mutex::new(None),
        }
    }

    pub fn current(&self) -> SidecarState {
        self.state.lock().unwrap().clone()
    }

    pub fn base(&self) -> Option<String> {
        match self.current() {
            SidecarState::Ready { base } => Some(base),
            _ => None,
        }
    }

    fn set_state(&self, state: SidecarState, app: &tauri::AppHandle) {
        *self.state.lock().unwrap() = state.clone();
        match &state {
            SidecarState::Ready { base } => {
                let _ = app.emit("sidecar-ready", serde_json::json!({ "base": base }));
            }
            SidecarState::Failed { error } => {
                let _ = app.emit(
                    "sidecar-failed",
                    serde_json::json!({
                        "state": "failed",
                        "error": error,
                        "retryable": true,
                    }),
                );
            }
            // Emit so the renderer can flip back to the "starting..." state
            // immediately after a retry, instead of showing "failed" until the
            // new sidecar reports ready.
            SidecarState::Starting => {
                let _ = app.emit("sidecar-starting", serde_json::json!({ "state": "starting" }));
            }
        }
    }
}

#[cfg(feature = "custom-protocol")]
fn api_base(port: u16) -> String {
    format!("http://127.0.0.1:{port}/api")
}

/// Spawn the compiled Deno API as a sidecar bound to `127.0.0.1:0` (port 0 lets the OS assign a
/// free port). The sidecar reports its bound port via stdout in the format "PORT:12345".
/// Returns the child handle and the bound port.
#[cfg(feature = "custom-protocol")]
fn spawn_sidecar(
    app: &tauri::AppHandle,
    manager: Arc<SidecarManager>,
) -> Result<(tauri_plugin_shell::process::CommandChild, u16), Box<dyn std::error::Error>> {
    let (mut rx, child) = app
        .shell()
        .sidecar("workboost-api")
        .expect("failed to resolve API sidecar")
        .env("WORKBOOST_HOST", "127.0.0.1")
        .env("WORKBOOST_PORT", "0")
        .spawn()?;

    let port_rx = std::sync::Arc::new(std::sync::Mutex::new(None::<u16>));
    let port_rx_clone = port_rx.clone();
    let manager_clone = Arc::clone(&manager);
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if let Some(rest) = text.strip_prefix("PORT:") {
                        if let Ok(port) = rest.trim().parse::<u16>() {
                            *port_rx_clone.lock().unwrap() = Some(port);
                        }
                    } else if !text.is_empty() {
                        eprintln!("[api sidecar] {}", text.trim_end());
                    }
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[api sidecar] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[api sidecar] terminated: {:?}", payload.code);
                    // Runtime failure: the sidecar exited after starting. Transition to
                    // Failed so the UI can show "AI unavailable" and offer a retry.
                    if let SidecarState::Ready { .. } = manager_clone.current() {
                        manager_clone.set_state(
                            SidecarState::Failed {
                                error: format!("sidecar terminated with code {:?}", payload.code),
                            },
                            &app_clone,
                        );
                    }
                }
                _ => {}
            }
        }
    });

    // Wait up to 20 seconds for the sidecar to report its bound port
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if let Some(port) = *port_rx.lock().unwrap() {
            return Ok((child, port));
        }
        if Instant::now() > deadline {
            return Err("API sidecar did not report its bound port in time".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Wait until the API is accepting connections on `127.0.0.1:<port>`. A TCP connect is sufficient:
/// once `Deno.serve` binds the socket the server is ready to accept requests.
#[cfg(feature = "custom-protocol")]
fn wait_for_listening(port: u16, timeout: Duration) -> Result<(), String> {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let deadline = Instant::now() + timeout;
    loop {
        if Instant::now() > deadline {
            return Err(format!(
                "API sidecar did not start listening on {addr} in time"
            ));
        }
        if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Spawn the sidecar in a background thread. Non-blocking: the caller (setup) returns
/// immediately and the webview loads while the sidecar starts.
#[cfg(feature = "custom-protocol")]
pub fn spawn_background(app: tauri::AppHandle, manager: Arc<SidecarManager>) {
    std::thread::spawn(move || {
        let (child, port) = match spawn_sidecar(&app, Arc::clone(&manager)) {
            Ok(result) => result,
            Err(err) => {
                manager.set_state(
                    SidecarState::Failed {
                        error: err.to_string(),
                    },
                    &app,
                );
                return;
            }
        };

        // The sidecar only reports its port after Deno.serve starts accepting connections,
        // so a TCP-connect failure here means the child died right after reporting.
        if let Err(err) = wait_for_listening(port, Duration::from_secs(20)) {
            let _ = child.kill();
            manager.set_state(
                SidecarState::Failed {
                    error: err.to_string(),
                },
                &app,
            );
            return;
        }

        *manager.child.lock().unwrap() = Some(child);
        manager.set_state(SidecarState::Ready { base: api_base(port) }, &app);
    });
}

/// Get the current sidecar state. Called by the TauriDataPort after it subscribes to
/// `sidecar-ready`/`sidecar-failed`/`sidecar-starting` events; the query reconciles any
/// transition that fired before the subscription was in place.
#[tauri::command]
pub fn get_sidecar_status(state: tauri::State<'_, Arc<SidecarManager>>) -> serde_json::Value {
    state.inner().current().to_payload()
}

/// Retry a failed sidecar. Only meaningful in bundled builds; dev builds are always ready.
#[tauri::command]
pub fn retry_sidecar(
    #[cfg_attr(not(feature = "custom-protocol"), allow(unused_variables))]
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<SidecarManager>>,
) -> Result<(), String> {
    match state.inner().current() {
        SidecarState::Failed { .. } => {
            // set_state emits `sidecar-starting` so the drawer returns to the
            // "starting..." state while the new sidecar boots.
            state.inner().set_state(SidecarState::Starting, &app);
            #[cfg(feature = "custom-protocol")]
            {
                let manager = Arc::clone(state.inner());
                spawn_background(app, manager);
            }
            Ok(())
        }
        _ => Ok(()),
    }
}
