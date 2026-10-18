use tauri::State;

use crate::api;
use crate::error::AppResult;
use crate::instance::ServerType;
use crate::providers::{BuildInfo, McVersion};
use crate::state::AppState;

#[tauri::command]
pub async fn list_mc_versions(
    state: State<'_, AppState>,
    server_type: ServerType,
) -> AppResult<Vec<McVersion>> {
    api::list_mc_versions(&state, server_type).await
}

#[tauri::command]
pub async fn list_builds(
    state: State<'_, AppState>,
    server_type: ServerType,
    mc_version: String,
) -> AppResult<Vec<BuildInfo>> {
    api::list_builds(&state, server_type, &mc_version).await
}
