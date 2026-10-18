use tauri::State;

use crate::api;
use crate::content::{ContentCategory, ContentFile, ContentSearchPage};
use crate::error::AppResult;
use crate::mrpack::ExportReport;
use crate::state::AppState;

#[tauri::command]
pub fn list_content(state: State<'_, AppState>, id: String) -> AppResult<Vec<ContentFile>> {
    api::list_content(&state, &id)
}

#[tauri::command]
pub fn toggle_content(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    api::toggle_content(&state, &id, &name)
}

#[tauri::command]
pub fn delete_content(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    api::delete_content(&state, &id, &name)
}

#[tauri::command]
pub fn add_content_file(state: State<'_, AppState>, id: String, path: String) -> AppResult<String> {
    api::add_content_file(&state, &id, &path)
}

#[tauri::command]
pub async fn search_content(
    state: State<'_, AppState>,
    id: String,
    source: String,
    query: Option<String>,
    category: Option<String>,
    sort: Option<String>,
    page: Option<u32>,
) -> AppResult<ContentSearchPage> {
    api::search_content(&state, &id, &source, query, category, sort, page).await
}

#[tauri::command]
pub async fn list_content_categories(
    state: State<'_, AppState>,
    id: String,
    source: String,
) -> AppResult<Vec<ContentCategory>> {
    api::list_content_categories(&state, &id, &source).await
}

#[tauri::command]
pub async fn install_content(
    state: State<'_, AppState>,
    id: String,
    source: String,
    project_id: String,
) -> AppResult<Vec<String>> {
    api::install_content(&state, &id, &source, &project_id).await
}

#[tauri::command]
pub fn installed_content_ids(state: State<'_, AppState>, id: String) -> AppResult<Vec<String>> {
    api::installed_content_ids(&state, &id)
}

#[tauri::command]
pub async fn export_mrpack(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> AppResult<ExportReport> {
    api::export_mrpack(&state, &id, &path).await
}
