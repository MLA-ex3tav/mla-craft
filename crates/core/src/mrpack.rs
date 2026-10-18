use std::io::{Read, Write};
use std::collections::HashMap;
use sha2::{Digest, Sha512};
use sha1::Sha1;
use std::path::Path;

use serde_json::json;
use crate::error::{AppError, AppResult};
use crate::instance::{Instance, ServerType};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub indexed: usize,
    pub bundled: usize,
}

type Versions = HashMap<String, serde_json::Value>;

fn hashes(path: &Path) -> AppResult<(String, String, u64)> {
    let mut file = std::fs::File::open(path)?;
    let mut sha1 = Sha1::new();
    let mut sha512 = Sha512::new();
    let mut size = 0;
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 { break; }
        sha1.update(&buffer[..count]);
        sha512.update(&buffer[..count]);
        size += count as u64;
    }
    Ok((hex::encode(sha1.finalize()), hex::encode(sha512.finalize()), size))
}

pub async fn export(client: &reqwest::Client, instance: Instance, dir: std::path::PathBuf, destination: std::path::PathBuf) -> AppResult<ExportReport> {
    let source = dir.clone();
    let local_hashes = tokio::task::spawn_blocking(move || -> AppResult<Vec<String>> {
        let mut result = Vec::new();
        let mods = source.join("mods");
        if mods.exists() {
            if std::fs::symlink_metadata(&mods)?.file_type().is_symlink() {
                return Err(AppError::Message("La carpeta mods no puede ser un enlace simbólico.".into()));
            }
            for entry in std::fs::read_dir(mods)? {
                let entry = entry?;
                if entry.file_type()?.is_file() && entry.path().extension().is_some_and(|v| v.eq_ignore_ascii_case("jar")) {
                    result.push(hashes(&entry.path())?.0);
                }
            }
        }
        Ok(result)
    }).await.map_err(|e| AppError::Message(e.to_string()))??;
    let mut versions = Versions::new();
    for batch in local_hashes.chunks(100) {
        let response: Versions = client.post("https://api.modrinth.com/v2/version_files")
            .timeout(std::time::Duration::from_secs(30))
            .json(&json!({"hashes": batch, "algorithm": "sha1"}))
            .send().await?.error_for_status()?.json().await?;
        versions.extend(response);
    }
    tokio::task::spawn_blocking(move || write_pack(&instance, &dir, &destination, &versions))
        .await.map_err(|e| AppError::Message(e.to_string()))?
}

fn write_pack(instance: &Instance, dir: &Path, destination: &Path, versions: &Versions) -> AppResult<ExportReport> {
    let loader = match instance.server_type {
        ServerType::Fabric => "fabric-loader",
        ServerType::Forge => "forge",
        ServerType::NeoForge => "neoforge",
        _ => return Err(AppError::Message("La exportación .mrpack requiere Fabric, Forge o NeoForge.".into())),
    };
    let version = instance.loader_version.as_deref().filter(|v| !v.trim().is_empty())
        .ok_or_else(|| AppError::Message("Falta la versión del cargador. Configura el servidor antes de exportar.".into()))?;
    if !destination.extension().is_some_and(|v| v.eq_ignore_ascii_case("mrpack")) {
        return Err(AppError::Message("El archivo debe tener la extensión .mrpack.".into()));
    }
    let mods = dir.join("mods");
    let mut paths = Vec::new();
    if mods.exists() {
        // Do not follow symlinks outside the instance.
        if std::fs::symlink_metadata(&mods)?.file_type().is_symlink() {
            return Err(AppError::Message("La carpeta mods no puede ser un enlace simbólico para exportar.".into()));
        }
        for entry in std::fs::read_dir(&mods)? {
            let entry = entry?;
            if entry.file_type()?.is_file() && entry.path().extension().is_some_and(|v| v.eq_ignore_ascii_case("jar")) {
                paths.push(entry.path());
            }
        }
    }
    paths.sort();
    if paths.is_empty() {
        return Err(AppError::Message("No hay mods activos para exportar.".into()));
    }
    let mut dependencies = serde_json::Map::new();
    dependencies.insert("minecraft".into(), json!(instance.mc_version));
    dependencies.insert(loader.into(), json!(version));
    let mut indexed_files = Vec::new();
    let mut bundled_paths = Vec::new();
    for path in &paths {
        let (sha1, sha512, size) = hashes(path)?;
        let matched = versions.get(&sha1).and_then(|v| v["files"].as_array())
            .and_then(|files| files.iter().find(|file| file["hashes"]["sha1"].as_str() == Some(&sha1)
                && file["hashes"]["sha512"].as_str() == Some(&sha512)
                && file["size"].as_u64() == Some(size)))
            .and_then(|file| file["url"].as_str())
            .filter(|url| url.starts_with("https://cdn.modrinth.com/"));
        if let Some(url) = matched {
            let name = path.file_name().and_then(|v| v.to_str())
                .ok_or_else(|| AppError::Message("Nombre de mod no válido.".into()))?;
            indexed_files.push(json!({
                "path": format!("mods/{name}"), "hashes": {"sha1": sha1, "sha512": sha512},
                "downloads": [url], "fileSize": size,
            }));
        } else {
            bundled_paths.push(path);
        }
    }
    let report = ExportReport { indexed: indexed_files.len(), bundled: bundled_paths.len() };
    let manifest = json!({
        "formatVersion": 1, "game": "minecraft",
        "versionId": uuid::Uuid::new_v4().to_string(), "name": instance.name,
        "summary": "Mods activos exportados desde MLA Server.",
        "files": indexed_files, "dependencies": dependencies,
    });
    let parent = destination.parent().filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| AppError::Message("Selecciona una ruta completa para guardar el pack.".into()))?;
    // Build beside the destination and replace only after a successful ZIP finish.
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    {
        let mut archive = zip::ZipWriter::new(temporary.as_file_mut());
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        archive.start_file("modrinth.index.json", options)?;
        archive.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
        for path in &bundled_paths {
            let name = path.file_name().and_then(|v| v.to_str())
                .ok_or_else(|| AppError::Message("Un mod tiene un nombre de archivo no válido.".into()))?;
            if name.contains(['/', '\\', ':']) {
                return Err(AppError::Message("Un mod tiene un nombre de archivo no seguro.".into()));
            }
            let mut file = std::fs::File::open(path)?;
            archive.start_file(format!("overrides/mods/{name}"), options.large_file(file.metadata()?.len() >= u32::MAX as u64))?;
            std::io::copy(&mut file, &mut archive)?;
        }
        archive.finish()?;
    }
    temporary.as_file().sync_all()?;
    temporary.persist(destination).map_err(|e| AppError::Io(e.error))?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn instance() -> Instance {
        serde_json::from_value(json!({"id":"test","name":"Mi pack","type":"fabric","mcVersion":"1.20.1","loaderVersion":"0.16.0","createdAt":"2026-10-15"})).unwrap()
    }

    #[test]
    fn exports_manifest_and_only_active_mods() {
        let dir = tempfile::tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
        std::fs::create_dir(dir.path().join("mods")).unwrap();
        std::fs::write(dir.path().join("mods/active.jar"), b"mod bytes").unwrap();
        std::fs::write(dir.path().join("mods/off.jar.disabled"), b"disabled").unwrap();
        std::fs::write(dir.path().join("server.properties"), b"private").unwrap();
        let destination = dir.path().join("pack.mrpack");
        assert_eq!(write_pack(&instance(), dir.path(), &destination, &Versions::new()).unwrap().bundled, 1);
        let mut zip = zip::ZipArchive::new(std::fs::File::open(destination).unwrap()).unwrap();
        assert_eq!(zip.len(), 2);
        let mut raw = String::new();
        zip.by_name("modrinth.index.json").unwrap().read_to_string(&mut raw).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(manifest["dependencies"]["fabric-loader"], "0.16.0");
        assert_eq!(manifest["formatVersion"], 1);
        assert_eq!(manifest["files"], json!([]));
        let mut bytes = Vec::new();
        zip.by_name("overrides/mods/active.jar").unwrap().read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, b"mod bytes");
    }

    #[test]
    fn recognized_mod_is_indexed_with_exact_download_and_hashes() {
        let dir = tempfile::tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
        std::fs::create_dir(dir.path().join("mods")).unwrap();
        let jar = dir.path().join("mods/active.jar");
        std::fs::write(&jar, b"mod bytes").unwrap();
        let (sha1, sha512, size) = hashes(&jar).unwrap();
        let url = "https://cdn.modrinth.com/data/example/versions/exact/mod.jar";
        let mut versions = Versions::new();
        versions.insert(sha1.clone(), json!({"files": [
            {"url":"https://cdn.modrinth.com/wrong.jar","hashes":{"sha1":"wrong"}},
            {"url":url,"hashes":{"sha1":sha1,"sha512":sha512},"size":size}
        ]}));
        let destination = dir.path().join("pack.mrpack");
        let report = write_pack(&instance(), dir.path(), &destination, &versions).unwrap();
        assert_eq!(report.indexed, 1);
        assert_eq!(report.bundled, 0);
        let mut zip = zip::ZipArchive::new(std::fs::File::open(destination).unwrap()).unwrap();
        assert_eq!(zip.len(), 1);
        let manifest: serde_json::Value = serde_json::from_reader(zip.by_name("modrinth.index.json").unwrap()).unwrap();
        assert_eq!(manifest["files"].as_array().unwrap().len(), 1);
        let file = &manifest["files"][0];
        assert_eq!(file["path"], "mods/active.jar");
        assert_eq!(file["downloads"][0], url);
        assert_eq!(file["hashes"]["sha1"], sha1);
        assert_eq!(file["hashes"]["sha512"], sha512);
        assert_eq!(file["fileSize"], size);
    }

    #[test]
    fn invalid_export_preserves_existing_file() {
        let dir = tempfile::tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
        let destination = dir.path().join("pack.mrpack");
        std::fs::write(&destination, b"original").unwrap();
        assert!(write_pack(&instance(), dir.path(), &destination, &Versions::new()).is_err());
        let mut missing = instance();
        missing.loader_version = None;
        assert!(write_pack(&missing, dir.path(), &destination, &Versions::new()).is_err());
        missing.server_type = ServerType::Paper;
        assert!(write_pack(&missing, dir.path(), &destination, &Versions::new()).is_err());
        assert_eq!(std::fs::read(destination).unwrap(), b"original");
    }
}
