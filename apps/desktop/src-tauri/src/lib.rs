use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, State};
use tauri_plugin_shell::process::CommandChild;
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

/// Wait until the API is accepting connections on `127.0.0.1:<port>`. A TCP connect is sufficient:
/// once `Deno.serve` binds the socket the server is ready to accept requests.
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
            // The sidecar binds port 0 and reports the bound port back to us,
            // eliminating the race condition where another process could claim the port.
            let (child, port) = spawn_sidecar(app).expect("failed to spawn API sidecar");

            // Wait until the API accepts connections so the webview's first request does not race
            // server startup. On failure, log it; the webview surfaces connection errors next.
            if let Err(err) = wait_for_listening(port, Duration::from_secs(20)) {
                eprintln!("[desktop] {err}");
            }
            let base = api_base(port);

            app.manage(ApiState {
                base,
                child: Mutex::new(Some(child)),
            });
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