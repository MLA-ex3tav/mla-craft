mod bus;
mod commands;

// Módulos de lógica compartidos (crate `mla-craft-core`), re-exportados para que
// los comandos sigan usando `crate::instance`, `crate::state`, etc.
pub use mla_craft_core::{
    api, backup, config, content, download, error, events, instance, java, mcsr, mrpack, paths,
    player_live, player_snapshot, players, process, providers, scheduler, state,
};

use std::sync::Arc;

use bus::TauriBus;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = paths::data_dir();
    let _ = paths::ensure_dir(&data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let bus = Arc::new(TauriBus::new(app.handle().clone()));
            let state = AppState::new(data_dir.clone(), bus);
            app.manage(state.clone());
            tauri::async_runtime::spawn(scheduler::run(state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::network::server_connections,
            commands::instance::list_instances,
            commands::instance::get_instance,
            commands::instance::create_instance,
            commands::instance::update_instance,
            commands::instance::delete_instance,
            commands::versions::list_mc_versions,
            commands::versions::list_builds,
            commands::java::list_java_runtimes,
            commands::java::ensure_java_runtime,
            commands::java::system_memory_mb,
            commands::server::install_server,
            commands::server::set_eula,
            commands::server::get_eula,
            commands::process::start_server,
            commands::process::stop_server,
            commands::process::restart_server,
            commands::process::send_server_command,
            commands::process::server_status,
            commands::process::kill_server,
            commands::process::online_players,
            commands::config::get_server_properties,
            commands::config::set_server_properties,
            commands::config::update_server_settings,
            commands::players::get_players,
            commands::players::get_player_snapshot,
            commands::players::save_player_list,
            commands::players::remove_player,
            commands::players::lookup_player,
            commands::content::list_content,
            commands::content::toggle_content,
            commands::content::delete_content,
            commands::content::add_content_file,
            commands::content::search_content,
            commands::content::list_content_categories,
            commands::content::install_content,
            commands::content::installed_content_ids,
            commands::content::export_mrpack,
            commands::backup::list_backups,
            commands::backup::create_backup,
            commands::backup::delete_backup,
            commands::backup::update_schedule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
