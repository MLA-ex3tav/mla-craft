use tauri::State;

use crate::api;
use crate::error::AppResult;
use crate::java::JavaRuntime;
use crate::state::AppState;

#[tauri::command]
pub fn list_java_runtimes(state: State<'_, AppState>) -> Vec<JavaRuntime> {
    api::list_java_runtimes(&state)
}

#[tauri::command]
pub fn system_memory_mb() -> u64 {
    api::system_memory_mb()
}

#[tauri::command]
pub async fn ensure_java_runtime(
    state: State<'_, AppState>,
    major: u32,
) -> AppResult<JavaRuntime> {
    api::ensure_java_runtime(&state, major).await
}
