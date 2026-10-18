use tauri::State;

use crate::api;
use crate::error::AppResult;
use crate::instance::{Instance, InstanceView, NewInstanceRequest};
use crate::state::AppState;

#[tauri::command]
pub fn list_instances(state: State<'_, AppState>) -> AppResult<Vec<InstanceView>> {
    api::list_instances(&state)
}

#[tauri::command]
pub fn get_instance(state: State<'_, AppState>, id: String) -> AppResult<InstanceView> {
    api::get_instance(&state, &id)
}

#[tauri::command]
pub fn create_instance(
    state: State<'_, AppState>,
    request: NewInstanceRequest,
) -> AppResult<InstanceView> {
    api::create_instance(&state, request)
}

#[tauri::command]
pub fn update_instance(
    state: State<'_, AppState>,
    instance: Instance,
    dir: String,
) -> AppResult<InstanceView> {
    api::update_instance(&state, instance, &dir)
}

#[tauri::command]
pub fn delete_instance(
    state: State<'_, AppState>,
    id: String,
    delete_files: bool,
) -> AppResult<()> {
    api::delete_instance(&state, &id, delete_files)
}
