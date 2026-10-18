use serde_json::Value;
use tauri::State;

use crate::api;
use crate::error::AppResult;
use crate::players::{PlayerIdentity, PlayersData};
use crate::state::AppState;

#[tauri::command]
pub fn get_players(state: State<'_, AppState>, id: String) -> AppResult<PlayersData> {
    api::get_players(&state, &id)
}

#[tauri::command]
pub fn save_player_list(
    state: State<'_, AppState>,
    id: String,
    list: String,
    entries: Vec<Value>,
) -> AppResult<()> {
    api::save_player_list(&state, &id, &list, entries)
}

#[tauri::command]
pub fn remove_player(
    state: State<'_, AppState>,
    id: String,
    list: String,
    id_field: String,
    value: String,
) -> AppResult<PlayersData> {
    api::remove_player(&state, &id, &list, &id_field, &value)
}

#[tauri::command]
pub async fn lookup_player(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<PlayerIdentity> {
    api::lookup_player(&state, &name).await
}

#[tauri::command]
pub async fn get_player_snapshot(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    uuid: Option<String>,
) -> AppResult<Value> {
    api::get_player_snapshot(&state, &id, name, uuid).await
}
