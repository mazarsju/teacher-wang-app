use std::io::Write;
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, RunEvent};

const API_PORT: u16 = 17831;
const SIDECAR_BASENAME: &str = "teacher-wang-api";

fn wait_for_api(port: u16) -> bool {
  for _ in 0..100 {
    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
      return true;
    }
    thread::sleep(Duration::from_millis(100));
  }
  false
}

fn sidecar_path() -> Result<std::path::PathBuf, String> {
  let exe = std::env::current_exe().map_err(|err| format!("current_exe failed: {err}"))?;
  let dir = exe
    .parent()
    .ok_or_else(|| "application directory missing".to_string())?;

  // Packaged install: Tauri copies externalBin next to the main executable.
  let bundled = dir.join(SIDECAR_BASENAME);
  if bundled.is_file() {
    return Ok(bundled);
  }

  // `tauri dev` / local runs: look in src-tauri/binaries next to the crate.
  let binaries_dir = dir.join("binaries");
  let unsuffixed = binaries_dir.join(SIDECAR_BASENAME);
  if unsuffixed.is_file() {
    return Ok(unsuffixed);
  }

  if let Ok(entries) = std::fs::read_dir(&binaries_dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
      if name.starts_with(&format!("{SIDECAR_BASENAME}-")) && path.is_file() {
        return Ok(path);
      }
    }
  }

  Err(format!(
    "API sidecar not found (looked for {} and under {})",
    bundled.display(),
    binaries_dir.display()
  ))
}

fn spawn_api_sidecar(app: &AppHandle) -> Result<(), String> {
  let state = app.state::<Arc<Mutex<Option<Child>>>>();
  {
    let guard = state
      .lock()
      .map_err(|_| "Failed to lock sidecar state".to_string())?;
    if guard.is_some() {
      return Ok(());
    }
  }

  let data_dir = app
    .path()
    .resolve("teacher-wang", BaseDirectory::AppData)
    .map_err(|err| format!("Failed to resolve app data dir: {err}"))?;
  std::fs::create_dir_all(&data_dir)
    .map_err(|err| format!("Failed to create app data dir: {err}"))?;
  std::fs::create_dir_all(data_dir.join("conversation_logs"))
    .map_err(|err| format!("Failed to create conversation logs dir: {err}"))?;

  let database_path = data_dir.join("teacher_wang.db");
  let config_path = data_dir.join(".config.txt");
  let logs_dir = data_dir.join("conversation_logs");
  let export_path = data_dir.join("db.txt");
  let binary = sidecar_path()?;

  println!("[tauri] starting API sidecar: {}", binary.display());

  let child = Command::new(&binary)
    .env("PORT", API_PORT.to_string())
    .env("HOST", "127.0.0.1")
    .env("DATABASE_PATH", database_path)
    .env("LLM_CONFIG_PATH", config_path)
    .env("CONVERSATION_LOGS_DIR", logs_dir)
    .env("DB_EXPORT_PATH", export_path)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|err| format!("Failed to spawn API sidecar {}: {err}", binary.display()))?;

  {
    let mut guard = state
      .lock()
      .map_err(|_| "Failed to lock sidecar state".to_string())?;
    *guard = Some(child);
  }

  if !wait_for_api(API_PORT) {
    return Err(format!(
      "API sidecar did not become ready on 127.0.0.1:{API_PORT}"
    ));
  }

  Ok(())
}

fn shutdown_api_sidecar(app: &AppHandle) {
  if let Ok(mut guard) = app.state::<Arc<Mutex<Option<Child>>>>().lock() {
    if let Some(mut child) = guard.take() {
      // PyInstaller onefile: ask the bootloader child to exit via stdin.
      if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"sidecar shutdown\n");
        let _ = stdin.flush();
      }
      thread::sleep(Duration::from_millis(300));
      let _ = child.kill();
      let _ = child.wait();
      println!("[tauri] API sidecar shutdown");
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      app.manage(Arc::new(Mutex::new(None::<Child>)));
      spawn_api_sidecar(app.handle())?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building Teacher Wang")
    .run(|app_handle, event| {
      if let RunEvent::ExitRequested { .. } = event {
        shutdown_api_sidecar(app_handle);
      }
    });
}
