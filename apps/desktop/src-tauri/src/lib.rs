use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
fn get_api_base(state: State<'_, ApiState>) -> String {
    state.base.clone()
}

/// Holds the resolved API base and, in release builds, the spawned sidecar child so it can be
/// cleaned up on exit. The child is `None` in dev builds (the API is started separately).
struct ApiState {
    base: String,
    child: Mutex<Option<CommandChild>>,
}

fn api_base(port: u16) -> String {
    format!("http://127.0.0.1:{port}/api")
}

/// In dev the API is started separately (`deno task dev`) so it can load the repo `.env` and bind the
/// port the webview expects; the webview talks to it over CORS. In release the shell spawns the
/// compiled sidecar and resolves its loopback base at runtime.
const DEV_API_BASE: &str = "http://localhost:3001/api";

fn pick_free_port(preferred: u16) -> u16 {
    // Prefer the conventional port; if it is taken (e.g. a separate `deno task dev` instance)
    // fall back to an OS-assigned free loopback port.
    if TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return preferred;
    }
    let listener =
        TcpListener::bind(("127.0.0.1", 0)).expect("failed to bind a loopback listener for a port");
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    port
}

/// Waits until the API is accepting connections on `127.0.0.1:<port>`. A TCP connect is sufficient:
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

/// Spawn the compiled Deno API as a sidecar bound to `127.0.0.1:<port>` and relay its output to the
/// host stderr so OS-level startup failures are visible rather than a silent blank window. Returns
/// the child handle so the caller can kill it on exit.
fn spawn_sidecar(
    app: &tauri::App,
    port: u16,
) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let (mut rx, child) = app
        .shell()
        // Use the basename so the runtime resolves `{exe_dir}/workboost-api`, which matches where the
        // bundler places externalBin binaries (it strips the `binaries/` source prefix and the
        // `-<target-triple>` suffix). `externalBin` keeps the `binaries/` source path.
        .sidecar("workboost-api")
        .expect("failed to resolve API sidecar")
        .env("WORKBOOST_PORT", port.to_string())
        .env("WORKBOOST_HOST", "127.0.0.1")
        .spawn()?;

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    eprintln!("[api sidecar] {}", String::from_utf8_lossy(&line));
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

    Ok(child)
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_api_base])
        .setup(|app| {
            let (base, child) = if cfg!(feature = "custom-protocol") {
                // Release: the bundled webview talks to a sidecar on a loopback port. The port is
                // passed via env so the API binds 127.0.0.1 (never 0.0.0.0), which keeps the auth and
                // assistant routes off the LAN.
                let port = pick_free_port(3001);
                let child = spawn_sidecar(app, port).expect("failed to spawn API sidecar");
                // Wait until the API accepts connections so the webview's first request does not race
                // server startup. On failure, log it; the webview surfaces connection errors next.
                if let Err(err) = wait_for_listening(port, Duration::from_secs(20)) {
                    eprintln!("[desktop] {err}");
                }
                (api_base(port), Some(child))
            } else {
                // Dev: run the API separately (`deno task dev`) so it loads the repo `.env`; this
                // keeps `cargo tauri dev` from needing secrets in the shell's env. The webview uses
                // the dev API base over CORS.
                (DEV_API_BASE.to_string(), None)
            };

            app.manage(ApiState {
                base,
                child: Mutex::new(child),
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
