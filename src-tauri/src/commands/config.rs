use std::collections::BTreeMap;

use tauri::State;

use crate::api;
use crate::config::Property;
use crate::error::AppResult;
use crate::instance::InstanceView;
use crate::state::AppState;

#[tauri::command]
pub fn get_server_properties(state: State<'_, AppState>, id: String) -> AppResult<Vec<Property>> {
    api::get_server_properties(&state, &id)
}

#[tauri::command]
pub fn set_server_properties(
    state: State<'_, AppState>,
    id: String,
    values: BTreeMap<String, String>,
) -> AppResult<()> {
    api::set_server_properties(&state, &id, values)
}

#[tauri::command]
pub fn update_server_settings(
    state: State<'_, AppState>,
    id: String,
    settings: api::ServerSettings,
) -> AppResult<InstanceView> {
    api::update_server_settings(&state, &id, settings)
}
