use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

/// Check if a CLI tool is available on PATH.
/// Uses `where` on Windows, `which` on macOS/Linux.
pub fn check_dependency(name: &str) -> bool {
    #[cfg(target_os = "windows")]
    let checker = "where";
    #[cfg(not(target_os = "windows"))]
    let checker = "which";

    Command::new(checker)
        .arg(name)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Run startup dependency checks. Called from setup() before any UI interaction.
/// If all deps present: emits `dep-check-passed`.
/// If any dep missing: navigates the main window to dep_screen.html with ?missing= param.
pub async fn run_startup_checks(app: AppHandle) {
    let bun_ok = check_dependency("bun");
    let gsd_ok = check_dependency("gsd");

    if bun_ok && gsd_ok {
        let _ = app.emit("dep-check-passed", ());
        return;
    }

    // Build missing list
    let mut missing: Vec<&str> = Vec::new();
    if !bun_ok {
        missing.push("bun");
    }
    if !gsd_ok {
        missing.push("gsd");
    }
    let missing_str = missing.join(",");

    eprintln!("[dep_check] Missing dependencies: {missing_str}");

    // Navigate main window to dep screen
    // Use the asset protocol to serve the bundled dep_screen.html
    let dep_url = format!("asset://localhost/dep_screen.html?missing={missing_str}");

    // Get main window and navigate
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(dep_url.parse().expect("valid dep screen URL"));
    }

    // Also emit event in case React app is listening
    let _ = app.emit("dep-check-failed", missing_str);
}
