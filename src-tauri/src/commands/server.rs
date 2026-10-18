use tauri::State;

use crate::api;
use crate::error::AppResult;
use crate::instance::InstanceView;
use crate::state::AppState;

#[tauri::command]
pub async fn install_server(state: State<'_, AppState>, id: String) -> AppResult<InstanceView> {
    api::install_server(&state, &id).await
}

#[tauri::command]
pub fn set_eula(state: State<'_, AppState>, id: String, accepted: bool) -> AppResult<()> {
    api::set_eula(&state, &id, accepted)
}

#[tauri::command]
pub fn get_eula(state: State<'_, AppState>, id: String) -> AppResult<bool> {
    api::get_eula(&state, &id)
}
