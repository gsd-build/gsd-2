#[tauri::command]
pub async fn open_folder_dialog() -> Option<String> {
    // Implemented in plan 15-04
    None
}

#[tauri::command]
pub async fn get_credential(_key: String) -> Option<String> {
    // Implemented in plan 15-04
    None
}

#[tauri::command]
pub async fn set_credential(_key: String, _value: String) -> bool {
    // Implemented in plan 15-04
    false
}

#[tauri::command]
pub async fn delete_credential(_key: String) -> bool {
    // Implemented in plan 15-04
    false
}

#[tauri::command]
pub async fn open_external(_url: String) -> bool {
    // Implemented in plan 15-04
    false
}

#[tauri::command]
pub fn get_platform() -> String {
    // Implemented in plan 15-04
    "unknown".to_string()
}

#[tauri::command]
pub async fn restart_bun(app: tauri::AppHandle) -> bool {
    // Implemented in plan 15-04
    super::bun_manager::restart_bun(app).await;
    true
}

#[tauri::command]
pub async fn retry_dep_check(app: tauri::AppHandle) -> bool {
    crate::dep_check::run_startup_checks(app).await;
    true
}
