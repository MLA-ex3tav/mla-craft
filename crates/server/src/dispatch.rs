use std::collections::BTreeMap;

use serde_json::{json, Value};

use mla_craft_core::error::{AppError, AppResult};
use mla_craft_core::instance::ServerType;
use mla_craft_core::state::AppState;
use mla_craft_core::{api, instance};

fn s(args: &Value, key: &str) -> AppResult<String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| AppError::Message(format!("Falta el parámetro «{key}»")))
}

fn opt_s(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(Value::as_str).map(str::to_string)
}

fn bool_or(args: &Value, key: &str, default: bool) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn u32_or(args: &Value, key: &str) -> Option<u32> {
    args.get(key).and_then(Value::as_u64).map(|v| v as u32)
}

fn server_type(args: &Value, key: &str) -> AppResult<ServerType> {
    let raw = s(args, key)?;
    serde_json::from_value::<ServerType>(Value::String(raw))
        .map_err(|_| AppError::Message("Tipo de servidor no válido.".into()))
}

fn val<T: serde::Serialize>(data: T) -> AppResult<Value> {
    Ok(serde_json::to_value(data)?)
}

/// Ejecuta un comando por nombre, igual que la IPC de Tauri.
pub async fn dispatch(state: &AppState, command: &str, args: &Value) -> AppResult<Value> {
    match command {
        // App y sistema
        "get_app_info" => val(api::app_info(state)),
        "system_memory_mb" => val(api::system_memory_mb()),
        "browse_fs" => val(api::browse(opt_s(args, "path").as_deref())?),
        "server_connections" => val(api::server_connections(state, &s(args, "id")?).await?),

        // Instancias
        "list_instances" => val(api::list_instances(state)?),
        "get_instance" => val(api::get_instance(state, &s(args, "id")?)?),
        "create_instance" => {
            let request = serde_json::from_value(args.get("request").cloned().unwrap_or(Value::Null))?;
            val(api::create_instance(state, request)?)
        }
        "update_instance" => {
            let cfg: instance::Instance =
                serde_json::from_value(args.get("instance").cloned().unwrap_or(Value::Null))?;
            val(api::update_instance(state, cfg, &s(args, "dir")?)?)
        }
        "delete_instance" => {
            api::delete_instance(state, &s(args, "id")?, bool_or(args, "deleteFiles", false))?;
            val(json!(null))
        }

        // Versiones
        "list_mc_versions" => val(api::list_mc_versions(state, server_type(args, "serverType")?).await?),
        "list_builds" => {
            val(api::list_builds(state, server_type(args, "serverType")?, &s(args, "mcVersion")?).await?)
        }

        // Java
        "list_java_runtimes" => val(api::list_java_runtimes(state)),
        "ensure_java_runtime" => {
            let major = u32_or(args, "major").ok_or_else(|| AppError::Message("Falta «major»".into()))?;
            val(api::ensure_java_runtime(state, major).await?)
        }

        // Servidor
        "install_server" => val(api::install_server(state, &s(args, "id")?).await?),
        "set_eula" => {
            api::set_eula(state, &s(args, "id")?, bool_or(args, "accepted", false))?;
            val(json!(null))
        }
        "get_eula" => val(api::get_eula(state, &s(args, "id")?)?),

        // Proceso
        "start_server" => {
            api::start_server(state, &s(args, "id")?).await?;
            val(json!(null))
        }
        "stop_server" => {
            api::stop_server(state, &s(args, "id")?).await?;
            val(json!(null))
        }
        "restart_server" => {
            api::restart_server(state, &s(args, "id")?).await?;
            val(json!(null))
        }
        "send_server_command" => {
            api::send_server_command(state, &s(args, "id")?, &s(args, "command")?).await?;
            val(json!(null))
        }
        "server_status" => val(api::server_status(state, &s(args, "id")?).await),
        "kill_server" => {
            api::kill_server(state, &s(args, "id")?).await;
            val(json!(null))
        }
        "online_players" => val(api::online_players(state, &s(args, "id")?).await?),

        // Configuración
        "get_server_properties" => val(api::get_server_properties(state, &s(args, "id")?)?),
        "set_server_properties" => {
            let values: BTreeMap<String, String> =
                serde_json::from_value(args.get("values").cloned().unwrap_or(Value::Null))?;
            api::set_server_properties(state, &s(args, "id")?, values)?;
            val(json!(null))
        }
        "update_server_settings" => {
            let settings: api::ServerSettings =
                serde_json::from_value(args.get("settings").cloned().unwrap_or(Value::Null))?;
            val(api::update_server_settings(state, &s(args, "id")?, settings)?)
        }

        // Jugadores
        "get_players" => val(api::get_players(state, &s(args, "id")?)?),
        "save_player_list" => {
            let entries: Vec<Value> =
                serde_json::from_value(args.get("entries").cloned().unwrap_or(Value::Null))?;
            api::save_player_list(state, &s(args, "id")?, &s(args, "list")?, entries)?;
            val(json!(null))
        }
        "remove_player" => val(api::remove_player(
            state,
            &s(args, "id")?,
            &s(args, "list")?,
            &s(args, "idField")?,
            &s(args, "value")?,
        )?),
        "lookup_player" => val(api::lookup_player(state, &s(args, "name")?).await?),
        "get_player_snapshot" => val(
            api::get_player_snapshot(state, &s(args, "id")?, opt_s(args, "name"), opt_s(args, "uuid"))
                .await?,
        ),

        // Contenido
        "list_content" => val(api::list_content(state, &s(args, "id")?)?),
        "toggle_content" => {
            api::toggle_content(state, &s(args, "id")?, &s(args, "name")?)?;
            val(json!(null))
        }
        "delete_content" => {
            api::delete_content(state, &s(args, "id")?, &s(args, "name")?)?;
            val(json!(null))
        }
        "add_content_file" => val(api::add_content_file(state, &s(args, "id")?, &s(args, "path")?)?),
        "search_content" => val(
            api::search_content(
                state,
                &s(args, "id")?,
                &s(args, "source")?,
                opt_s(args, "query"),
                opt_s(args, "category"),
                opt_s(args, "sort"),
                u32_or(args, "page"),
            )
            .await?,
        ),
        "list_content_categories" => val(
            api::list_content_categories(state, &s(args, "id")?, &s(args, "source")?).await?,
        ),
        "install_content" => val(
            api::install_content(
                state,
                &s(args, "id")?,
                &s(args, "source")?,
                &s(args, "projectId")?,
            )
            .await?,
        ),
        "installed_content_ids" => val(api::installed_content_ids(state, &s(args, "id")?)?),
        "export_mrpack" => val(api::export_mrpack(state, &s(args, "id")?, &s(args, "path")?).await?),

        // Backups
        "list_backups" => val(api::list_backups(state, &s(args, "id")?)?),
        "create_backup" => val(api::create_backup(state, &s(args, "id")?).await?),
        "delete_backup" => {
            api::delete_backup(state, &s(args, "id")?, &s(args, "name")?)?;
            val(json!(null))
        }
        "update_schedule" => {
            let settings: api::ScheduleSettings =
                serde_json::from_value(args.get("settings").cloned().unwrap_or(Value::Null))?;
            val(api::update_schedule(state, &s(args, "id")?, settings)?)
        }

        other => Err(AppError::Message(format!("Comando desconocido: {other}"))),
    }
}
