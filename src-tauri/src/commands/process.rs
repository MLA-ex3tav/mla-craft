use tauri::State;

use crate::api;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn start_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    api::start_server(&state, &id).await
}

#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    api::stop_server(&state, &id).await
}

#[tauri::command]
pub async fn restart_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    api::restart_server(&state, &id).await
}

#[tauri::command]
pub async fn send_server_command(
    state: State<'_, AppState>,
    id: String,
    command: String,
) -> AppResult<()> {
    api::send_server_command(&state, &id, &command).await
}

#[tauri::command]
pub async fn server_status(state: State<'_, AppState>, id: String) -> AppResult<bool> {
    Ok(api::server_status(&state, &id).await)
}

#[tauri::command]
pub async fn kill_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    api::kill_server(&state, &id).await;
    Ok(())
}

#[tauri::command]
pub async fn online_players(state: State<'_, AppState>, id: String) -> AppResult<Vec<String>> {
    api::online_players(&state, &id).await
}
