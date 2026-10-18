use tauri::State;

use crate::api;
use crate::state::AppState;

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> api::AppInfo {
    api::app_info(&state)
}
