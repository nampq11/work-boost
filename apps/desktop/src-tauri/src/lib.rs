// Sidecar plumbing is only compiled for bundled builds: `tauri build` enables the
// `custom-protocol` feature, `tauri dev` does not. In dev the shell points at a separately
// started `deno task dev` API instead, so a stale sidecar binary can never break startup.
#[cfg(feature = "custom-protocol")]
use std::net::TcpStream;
use std::sync::Mutex;
#[cfg(feature = "custom-protocol")]
use std::time::{Duration, Instant};

use tauri::{Manager, State};
use tauri_plugin_shell::process::CommandChild;
#[cfg(feature = "custom-protocol")]
use tauri_plugin_shell::ShellExt;

#[tauri::command]
fn get_api_base(state: State<'_, ApiState>) -> String {
    state.base.clone()
}

/// Holds the resolved API base and the spawned sidecar child so it can be killed on exit.
struct ApiState {
    base: String,
    child: Mutex<Option<CommandChild>>,
}

fn api_base(port: u16) -> String {
    format!("http://127.0.0.1:{port}/api")
}

/// Conventional port of a separately started dev API (`deno task dev` in apps/api).
#[cfg(not(feature = "custom-protocol"))]
const DEV_API_PORT: u16 = 3001;

/// Wait until the API is accepting connections on `127.0.0.1:<port>`. A TCP connect is sufficient:
/// once `Deno.serve` binds the socket the server is ready to accept requests.
#[cfg(feature = "custom-protocol")]
fn wait_for_listening(port: u16, timeout: Duration) -> Result<(), String> {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let deadline = Instant::now() + timeout;
    loop {
        if Instant::now() > deadline {
            return Err(format!("API sidecar did not start listening on {addr} in time"));
        }
        if TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Spawn the compiled Deno API as a sidecar bound to `127.0.0.1:0` (port 0 lets the OS assign a free port).
/// The sidecar will report its bound port via stdout in the format "PORT:12345".
/// Returns the child handle and the bound port.
#[cfg(feature = "custom-protocol")]
fn spawn_sidecar(
    app: &tauri::App,
) -> Result<(CommandChild, u16), Box<dyn std::error::Error>> {
    let (mut rx, child) = app
        .shell()
        .sidecar("workboost-api")
        .expect("failed to resolve API sidecar")
        .env("WORKBOOST_HOST", "127.0.0.1")
        .env("WORKBOOST_PORT", "0")
        .spawn()?;

    // Relay output to stderr for visibility, and capture the bound port
    let port_rx = std::sync::Arc::new(std::sync::Mutex::new(None::<u16>));
    let port_rx_clone = port_rx.clone();

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    // Capture PORT:XXXX from sidecar output
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

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_api_base])
        .setup(|app| {
            #[cfg(feature = "custom-protocol")]
            {
                // The sidecar binds port 0 and reports the bound port back to us,
                // eliminating the race condition where another process could claim the port.
                let (child, port) = spawn_sidecar(app)?;

                // The sidecar only reports its port after Deno.serve starts accepting connections,
                // so a TCP-connect failure here means the child died right after reporting. Fail
                // fast: managing state with a dead base would leave every webview request erroring
                // with no recovery path.
                if let Err(err) = wait_for_listening(port, Duration::from_secs(20)) {
                    let _ = child.kill();
                    return Err(err.into());
                }

                app.manage(ApiState {
                    base: api_base(port),
                    child: Mutex::new(Some(child)),
                });
            }

            #[cfg(not(feature = "custom-protocol"))]
            {
                // Dev build (`tauri dev`): expect the API running separately via `deno task dev`.
                // If it is not up yet, the webview surfaces connection errors and recovers once it
                // starts - no sidecar lifecycle to fight while iterating.
                app.manage(ApiState {
                    base: api_base(DEV_API_PORT),
                    child: Mutex::new(None),
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Work Boost desktop");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<ApiState>() {
                if let Ok(mut guard) = state.child.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
