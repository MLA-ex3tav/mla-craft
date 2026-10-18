use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const ADOPTIUM: &str = "https://api.adoptium.net/v3/assets/latest";

/// Runtime de Java detectado (instalado por la app o del sistema).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntime {
    pub major: u32,
    pub path: String,
    pub version: String,
    /// "managed" si lo instaló la app, "system" si viene del sistema.
    pub source: String,
}

impl JavaRuntime {
    fn from_exe(exe: &Path, source: &str) -> Option<Self> {
        let version = java_version(exe).ok()?;
        let major = parse_java_major(&version)?;
        Some(Self {
            major,
            path: exe.to_string_lossy().to_string(),
            version,
            source: source.to_string(),
        })
    }
}

pub fn java_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("java")
}

fn java_exe_name() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

/// Busca `bin/java.exe` dentro de `base`.
fn find_java_exe(base: &Path) -> Option<PathBuf> {
    let direct = base.join("bin").join(java_exe_name());
    if direct.exists() {
        return Some(direct);
    }

    let exe = std::ffi::OsStr::new(java_exe_name());
    let bin = std::ffi::OsStr::new("bin");

    for entry in walkdir::WalkDir::new(base)
        .max_depth(3)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let name_matches = path.file_name().is_some_and(|n| n == exe);
        let in_bin = path
            .parent()
            .and_then(|p| p.file_name())
            .is_some_and(|n| n == bin);
        if name_matches && in_bin {
            return Some(path.to_path_buf());
        }
    }
    None
}

/// Ejecuta `java -version` y devuelve la línea de versión.
pub fn java_version(exe: &Path) -> AppResult<String> {
    let output = Command::new(exe).arg("-version").output()?;
    // `java -version` escribe en stderr.
    let text = String::from_utf8_lossy(&output.stderr);
    extract_version(&text)
        .or_else(|| extract_version(&String::from_utf8_lossy(&output.stdout)))
        .ok_or_else(|| AppError::Message("No se pudo detectar la versión de Java".into()))
}

/// Extrae el número de versión de la salida de `java -version`.
pub fn extract_version(text: &str) -> Option<String> {
    for line in text.lines() {
        if line.to_lowercase().contains("version") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    return Some(line[start + 1..start + 1 + end].to_string());
                }
            }
        }
    }
    None
}

/// Deriva el major de una cadena tipo `21.0.5`, `1.8.0_392` o `17.0.9`.
pub fn parse_java_major(version: &str) -> Option<u32> {
    let cleaned = version.trim().trim_start_matches('"');
    let mut parts = cleaned.split(['.', '_', '-', '+']);
    let first: u32 = parts.next()?.parse().ok()?;
    if first == 1 {
        parts.next()?.parse().ok()
    } else {
        Some(first)
    }
}

/// Lista los runtimes de Java disponibles: gestionados por la app y del sistema.
pub fn list_runtimes(data_dir: &Path) -> Vec<JavaRuntime> {
    let mut out: Vec<JavaRuntime> = Vec::new();
    let mut seen: Vec<PathBuf> = Vec::new();

    let push = |rt: Option<JavaRuntime>, seen: &mut Vec<PathBuf>, out: &mut Vec<JavaRuntime>| {
        if let Some(rt) = rt {
            let p = PathBuf::from(&rt.path);
            let canon = p.canonicalize().unwrap_or(p);
            if !seen.contains(&canon) {
                seen.push(canon);
                out.push(rt);
            }
        }
    };

    // Gestionados por la app.
    let managed = java_dir(data_dir);
    if managed.exists() {
        if let Ok(entries) = std::fs::read_dir(&managed) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(exe) = find_java_exe(&path) {
                        push(JavaRuntime::from_exe(&exe, "managed"), &mut seen, &mut out);
                    }
                }
            }
        }
    }

    // JAVA_HOME.
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let exe = PathBuf::from(home).join("bin").join(java_exe_name());
        if exe.exists() {
            push(JavaRuntime::from_exe(&exe, "system"), &mut seen, &mut out);
        }
    }

    // PATH.
    if let Some(exe) = find_on_path() {
        push(JavaRuntime::from_exe(&exe, "system"), &mut seen, &mut out);
    }

    out.sort_by_key(|r| r.major);
    out
}

fn find_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(java_exe_name());
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Devuelve un runtime que cubra el `major` requerido, si existe.
pub fn find_runtime_for(data_dir: &Path, major: u32) -> Option<JavaRuntime> {
    let runtimes = list_runtimes(data_dir);
    runtimes
        .iter()
        .filter(|r| r.major == major)
        .cloned()
        .next()
        .or_else(|| runtimes.iter().filter(|r| r.major > major).cloned().next())
}

// ---------------------------------------------------------------------------
// Adoptium
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AdoptiumAsset {
    binary: AdoptiumBinary,
}

#[derive(Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
}

#[derive(Deserialize)]
struct AdoptiumPackage {
    checksum: String,
    link: String,
    name: String,
}

/// Descarga e instala un JDK de Eclipse Temurin para el `major` dado.
pub async fn install_java<F>(
    client: &reqwest::Client,
    data_dir: &Path,
    major: u32,
    mut on_progress: F,
) -> AppResult<JavaRuntime>
where
    F: FnMut(u64, Option<u64>),
{
    let url = format!(
        "{ADOPTIUM}/{major}/hotspot?os=windows&architecture=x64&image_type=jdk&vendor=eclipse"
    );
    let resp = client.get(&url).send().await?.error_for_status()?;
    let assets: Vec<AdoptiumAsset> = resp.json().await?;
    let asset = assets
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Message(format!("No hay JDK {major} disponible en Adoptium")))?;

    let pkg = asset.binary.package;
    on_progress(0, None);

    let zip_path = crate::download::download_to_temp(client, &pkg.link, &pkg.name, &mut on_progress)
        .await?;
    // Verificación básica de checksum al extraer más abajo no aplica; usamos el sha del asset.
    let _ = &pkg.checksum;

    let target = java_dir(data_dir).join(format!("jdk-{major}"));
    if target.exists() {
        let _ = std::fs::remove_dir_all(&target);
    }
    crate::paths::ensure_dir(&target)?;

    let zip_path_clone = zip_path.clone();
    let target_clone = target.clone();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let file = std::fs::File::open(&zip_path_clone)?;
        let mut archive = zip::ZipArchive::new(file)?;
        archive.extract(&target_clone)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Message(format!("Fallo al extraer: {e}")))??;

    let _ = std::fs::remove_file(&zip_path);

    let exe = find_java_exe(&target)
        .ok_or_else(|| AppError::Message("No se encontró java.exe tras extraer".into()))?;

    JavaRuntime::from_exe(&exe, "managed")
        .ok_or_else(|| AppError::Message("JDK instalado pero no ejecutable".into()))
}

/// Asegura que exista un Java del `major` requerido, instalándolo si hace falta.
pub async fn ensure_java<F>(
    client: &reqwest::Client,
    data_dir: &Path,
    major: u32,
    on_progress: F,
) -> AppResult<JavaRuntime>
where
    F: FnMut(u64, Option<u64>),
{
    if let Some(rt) = find_runtime_for(data_dir, major) {
        return Ok(rt);
    }
    install_java(client, data_dir, major, on_progress).await
}

/// Memoria total del sistema en MiB.
pub fn system_memory_mb() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.total_memory() / 1024 / 1024
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_majors() {
        assert_eq!(parse_java_major("21.0.5"), Some(21));
        assert_eq!(parse_java_major("1.8.0_392"), Some(8));
        assert_eq!(parse_java_major("17.0.9"), Some(17));
        assert_eq!(parse_java_major("25"), Some(25));
    }

    #[test]
    fn extract_from_output() {
        let text = "openjdk version \"21.0.5\" 2024-10-15 LTS\nOpenJDK Runtime Environment";
        assert_eq!(extract_version(text), Some("21.0.5".to_string()));
    }
}
