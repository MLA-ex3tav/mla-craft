use std::path::PathBuf;
use std::time::Duration;

use crate::instance;
use crate::state::AppState;
use crate::{backup, process};

/// Bucle del planificador de backups y reinicios programados.
///
/// El host decide cómo ejecutarlo (Tauri o tokio).
pub async fn run(state: AppState) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        tick(&state).await;
    }
}

fn is_due(last: Option<&str>, interval_minutes: u32, now: chrono::DateTime<chrono::Utc>) -> bool {
    match last.and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()) {
        Some(t) => (now - t.with_timezone(&chrono::Utc)).num_minutes() >= interval_minutes as i64,
        None => true,
    }
}

async fn tick(state: &AppState) {
    let data_dir = state.data_dir.clone();

    let Ok(list) = instance::list_instances(&data_dir) else {
        return;
    };
    let now = chrono::Utc::now();

    for view in list {
        if !view.config.installed {
            continue;
        }
        let dir = PathBuf::from(&view.dir);
        let running = process::is_running(&state.processes, &view.config.id).await;

        // Backup programado (solo con el servidor detenido).
        if let Some(interval) = view.config.backup_interval_minutes {
            if interval > 0
                && !running
                && is_due(view.config.last_backup_at.as_deref(), interval, now)
            {
                let retention = view.config.backup_retention.unwrap_or(5);
                if backup::create_backup(dir.clone(), retention).await.is_ok() {
                    let mut config = view.config.clone();
                    config.last_backup_at = Some(now.to_rfc3339());
                    let _ = instance::update_instance(&data_dir, config, &dir);
                }
            }
        }

        // Reinicio programado.
        if let Some(interval) = view.config.restart_interval_minutes {
            if interval > 0 && running && is_due(view.config.last_restart_at.as_deref(), interval, now)
            {
                let mut config = view.config.clone();
                config.last_restart_at = Some(now.to_rfc3339());
                let _ = instance::update_instance(&data_dir, config.clone(), &dir);

                let _ = process::stop(state, &config.id).await;
                tokio::time::sleep(Duration::from_secs(3)).await;
                let _ = process::start(state, &config, &dir).await;
            }
        }
    }
}
