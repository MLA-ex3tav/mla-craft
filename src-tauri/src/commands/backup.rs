use tauri::State;

use crate::api;
use crate::backup::BackupEntry;
use crate::error::AppResult;
use crate::instance::InstanceView;
use crate::state::AppState;

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>, id: String) -> AppResult<Vec<BackupEntry>> {
    api::list_backups(&state, &id)
}

#[tauri::command]
pub async fn create_backup(state: State<'_, AppState>, id: String) -> AppResult<String> {
    api::create_backup(&state, &id).await
}

#[tauri::command]
pub fn delete_backup(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    api::delete_backup(&state, &id, &name)
}

#[tauri::command]
pub fn update_schedule(
    state: State<'_, AppState>,
    id: String,
    settings: api::ScheduleSettings,
) -> AppResult<InstanceView> {
    api::update_schedule(&state, &id, settings)
}
