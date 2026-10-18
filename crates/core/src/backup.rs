use std::path::{Path, PathBuf};

use serde::Serialize;
use zip::write::SimpleFileOptions;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub name: String,
    pub size: u64,
    pub created: String,
}

pub fn backups_dir(dir: &Path) -> PathBuf {
    dir.join("backups")
}

/// Lee el `level-name` de server.properties (por defecto `world`).
pub fn world_name(dir: &Path) -> String {
    let path = crate::config::properties_path(dir);
    if let Ok(text) = std::fs::read_to_string(path) {
        if let Some(value) = crate::config::parse_properties(&text).get("level-name") {
            if !value.is_empty() {
                return value.clone();
            }
        }
    }
    "world".to_string()
}

fn timestamp() -> String {
    chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string()
}

/// Crea un backup comprimido de la carpeta del mundo.
pub async fn create_backup(dir: PathBuf, retention: u32) -> AppResult<String> {
    tokio::task::spawn_blocking(move || create_backup_blocking(&dir, retention))
        .await
        .map_err(|e| AppError::Message(format!("Fallo al respaldar: {e}")))?
}

fn create_backup_blocking(dir: &Path, retention: u32) -> AppResult<String> {
    let world = dir.join(world_name(dir));
    if !world.exists() {
        return Err(AppError::Message(
            "La carpeta del mundo aún no existe.".into(),
        ));
    }

    let backups = backups_dir(dir);
    crate::paths::ensure_dir(&backups)?;

    let name = format!("{}.zip", timestamp().replace(':', "-"));
    let dest = backups.join(&name);

    let file = std::fs::File::create(&dest)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let walker = walkdir::WalkDir::new(&world).into_iter().filter_map(Result::ok);
    for entry in walker {
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(&world) else {
            continue;
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if entry.file_type().is_dir() {
            if !rel_str.is_empty() {
                zip.add_directory(format!("{rel_str}/"), options)?;
            }
        } else if entry.file_type().is_file() {
            zip.start_file(rel_str, options)?;
            let mut f = std::fs::File::open(path)?;
            std::io::copy(&mut f, &mut zip)?;
        }
    }
    zip.finish()?;

    if retention > 0 {
        prune(dir, retention)?;
    }

    Ok(name)
}

pub fn list_backups(dir: &Path) -> Vec<BackupEntry> {
    let backups = backups_dir(dir);
    if !backups.exists() {
        return Vec::new();
    }
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&backups) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("zip") {
                continue;
            }
            let meta = entry.metadata().ok();
            let created = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .map(format_time)
                .unwrap_or_default();
            out.push(BackupEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                size: meta.map(|m| m.len()).unwrap_or(0),
                created,
            });
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    out
}

fn format_time(time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<chrono::Local> = time.into();
    datetime.format("%Y-%m-%d %H:%M").to_string()
}

pub fn delete_backup(dir: &Path, name: &str) -> AppResult<()> {
    let path = backups_dir(dir).join(name);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// Conserva solo los `retention` backups más recientes.
pub fn prune(dir: &Path, retention: u32) -> AppResult<()> {
    let mut list = list_backups(dir);
    if list.len() <= retention as usize {
        return Ok(());
    }
    list.sort_by(|a, b| b.name.cmp(&a.name));
    for entry in list.into_iter().skip(retention as usize) {
        let _ = std::fs::remove_file(backups_dir(dir).join(&entry.name));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_lists_backup() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let world = dir.join("world");
        std::fs::create_dir_all(world.join("region")).unwrap();
        std::fs::write(world.join("level.dat"), b"hello").unwrap();
        std::fs::write(world.join("region").join("r.0.0.mca"), b"data").unwrap();

        let name = create_backup_blocking(dir, 5).unwrap();
        assert!(name.ends_with(".zip"));

        let list = list_backups(dir);
        assert_eq!(list.len(), 1);
        assert!(list[0].size > 0);
    }

    #[test]
    fn prunes_old_backups() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let world = dir.join("world");
        std::fs::create_dir_all(&world).unwrap();
        std::fs::write(world.join("level.dat"), b"x").unwrap();

        let backups = backups_dir(dir);
        std::fs::create_dir_all(&backups).unwrap();
        for i in 0..5 {
            std::fs::write(backups.join(format!("2026-01-0{i}_00-00-00.zip")), b"z").unwrap();
        }

        prune(dir, 2).unwrap();
        assert_eq!(list_backups(dir).len(), 2);
    }
}
