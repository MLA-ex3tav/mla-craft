use tauri::State;

use crate::api;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn server_connections(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<api::Connections> {
    api::server_connections(&state, &id).await
}
