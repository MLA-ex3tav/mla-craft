use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::instance::ServerType;

const VANILLA_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const PAPER_API: &str = "https://fill.papermc.io/v3/projects/paper";

/// Versión de Minecraft ofrecida por un proveedor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McVersion {
    pub id: String,
    pub version_type: String,
    pub java_major: Option<u32>,
    pub latest: bool,
}

/// Build concreto de un servidor (Paper, Spigot, etc.).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub id: String,
    pub channel: Option<String>,
    pub released_at: Option<String>,
}

async fn get_json<T>(client: &reqwest::Client, url: &str) -> AppResult<T>
where
    T: for<'de> Deserialize<'de>,
{
    let resp = client.get(url).send().await?.error_for_status()?;
    Ok(resp.json::<T>().await?)
}

async fn get_text(client: &reqwest::Client, url: &str) -> AppResult<String> {
    let resp = client.get(url).send().await?.error_for_status()?;
    Ok(resp.text().await?)
}

/// Versión de Java requerida por una versión de Minecraft.
///
/// Tabla de respaldo usada cuando el proveedor no la informa.
pub fn required_java_for_mc(mc: &str) -> u32 {
    let parts: Vec<u32> = mc.split(['.', '-']).filter_map(|p| p.parse().ok()).collect();
    let major = parts.first().copied().unwrap_or(1);
    let minor = parts.get(1).copied().unwrap_or(0);
    let patch = parts.get(2).copied().unwrap_or(0);

    if major >= 26 {
        return 21;
    }
    if major == 1 {
        if minor <= 16 {
            return 8;
        }
        if minor == 17 {
            return 16;
        }
        if minor < 20 || (minor == 20 && patch < 5) {
            return 17;
        }
        return 21;
    }
    8
}

// ---------------------------------------------------------------------------
// Vanilla (Mojang)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct VersionManifest {
    versions: Vec<ManifestVersion>,
}

#[derive(Deserialize)]
struct ManifestVersion {
    id: String,
    #[serde(rename = "type")]
    version_type: String,
}

async fn vanilla_versions(client: &reqwest::Client) -> AppResult<Vec<McVersion>> {
    let manifest: VersionManifest = get_json(client, VANILLA_MANIFEST).await?;
    let mut out = Vec::with_capacity(manifest.versions.len());
    for (i, v) in manifest.versions.into_iter().enumerate() {
        let java = if v.version_type == "release" {
            Some(required_java_for_mc(&v.id))
        } else {
            None
        };
        out.push(McVersion {
            id: v.id,
            version_type: v.version_type,
            java_major: java,
            latest: i == 0,
        });
    }
    Ok(out)
}

/// Resuelve la URL del `server.jar` de Vanilla y su versión de Java.
pub async fn vanilla_server(client: &reqwest::Client, mc: &str) -> AppResult<(String, u32)> {
    let manifest: VersionManifestFull = get_json(client, VANILLA_MANIFEST).await?;
    let entry = manifest
        .versions
        .into_iter()
        .find(|v| v.id == mc)
        .ok_or_else(|| AppError::NotFound(format!("versión vanilla {mc}")))?;

    let version: VersionJson = get_json(client, &entry.url).await?;
    let server = version
        .downloads
        .server
        .ok_or_else(|| AppError::Message(format!("{mc} no tiene server.jar")))?;
    let java = version
        .java_version
        .map(|j| j.major_version)
        .unwrap_or_else(|| required_java_for_mc(mc));
    Ok((server.url, java))
}

#[derive(Deserialize)]
struct VersionManifestFull {
    versions: Vec<ManifestVersionFull>,
}

#[derive(Deserialize)]
struct ManifestVersionFull {
    id: String,
    url: String,
}

#[derive(Deserialize)]
struct VersionJson {
    downloads: VersionDownloads,
    #[serde(rename = "javaVersion", default)]
    java_version: Option<JavaVersionInfo>,
}

#[derive(Deserialize)]
struct VersionDownloads {
    #[serde(default)]
    server: Option<ServerDownloadInfo>,
}

#[derive(Deserialize)]
struct ServerDownloadInfo {
    url: String,
}

#[derive(Deserialize)]
struct JavaVersionInfo {
    #[serde(rename = "majorVersion")]
    major_version: u32,
}

// ---------------------------------------------------------------------------
// Paper (Fill v3)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PaperVersionsResp {
    versions: Vec<PaperVersionEntry>,
}

#[derive(Deserialize)]
struct PaperVersionEntry {
    version: PaperVersionInfo,
    #[serde(default)]
    builds: Vec<u32>,
}

#[derive(Deserialize)]
struct PaperVersionInfo {
    id: String,
    #[serde(default)]
    support: Option<PaperSupport>,
    #[serde(default)]
    java: Option<PaperJava>,
}

#[derive(Deserialize)]
struct PaperSupport {
    #[serde(default)]
    status: Option<String>,
}

#[derive(Deserialize)]
struct PaperJava {
    version: PaperJavaVersion,
}

#[derive(Deserialize)]
struct PaperJavaVersion {
    #[serde(default)]
    minimum: Option<u32>,
}

async fn paper_versions(client: &reqwest::Client) -> AppResult<Vec<McVersion>> {
    let resp: PaperVersionsResp = get_json(client, &format!("{PAPER_API}/versions")).await?;
    let mut out = Vec::new();
    for (i, entry) in resp.versions.into_iter().enumerate() {
        if entry.builds.is_empty() {
            continue;
        }
        let status = entry
            .version
            .support
            .and_then(|s| s.status)
            .unwrap_or_else(|| "RELEASE".to_string())
            .to_lowercase();
        let java = entry
            .version
            .java
            .and_then(|j| j.version.minimum)
            .or_else(|| Some(required_java_for_mc(&entry.version.id)));
        out.push(McVersion {
            id: entry.version.id,
            version_type: status,
            java_major: java,
            latest: i == 0,
        });
    }
    Ok(out)
}

#[derive(Deserialize)]
struct PaperBuild {
    id: u32,
    #[serde(default)]
    channel: Option<String>,
    #[serde(default)]
    time: Option<String>,
}

#[derive(Deserialize)]
struct PaperBuildDownload {
    downloads: PaperDownloads,
}

#[derive(Deserialize)]
struct PaperDownloads {
    #[serde(rename = "server:default")]
    server: PaperFile,
}

#[derive(Deserialize)]
struct PaperFile {
    url: String,
    #[serde(default)]
    checksums: PaperChecksums,
}

#[derive(Deserialize, Default)]
struct PaperChecksums {
    #[serde(default)]
    sha256: Option<String>,
}

/// Resuelve la URL de descarga y sha256 de un build de Paper.
pub async fn paper_build(client: &reqwest::Client, mc: &str, build: u32) -> AppResult<(String, Option<String>)> {
    let info: PaperBuildDownload =
        get_json(client, &format!("{PAPER_API}/versions/{mc}/builds/{build}")).await?;
    Ok((info.downloads.server.url, info.downloads.server.checksums.sha256))
}

async fn paper_builds(client: &reqwest::Client, mc: &str) -> AppResult<Vec<BuildInfo>> {
    let builds: Vec<PaperBuild> =
        get_json(client, &format!("{PAPER_API}/versions/{mc}/builds")).await?;
    Ok(builds
        .into_iter()
        .map(|b| BuildInfo {
            id: b.id.to_string(),
            channel: b.channel,
            released_at: b.time,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Spigot (vía GetBukkit, jars ya compilados con BuildTools)
// ---------------------------------------------------------------------------

const GETBUKKIT_API: &str = "https://getbukkit.org/api/jars/spigot";
const GETBUKKIT_CDN: &str = "https://cdn.getbukkit.org";

#[derive(Deserialize)]
struct GetBukkitJar {
    version: String,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(rename = "downloadUrl")]
    download_url: String,
}

async fn spigot_jars(client: &reqwest::Client) -> AppResult<Vec<GetBukkitJar>> {
    get_json(client, GETBUKKIT_API).await
}

async fn spigot_versions(client: &reqwest::Client) -> AppResult<Vec<McVersion>> {
    let jars = spigot_jars(client).await?;
    Ok(jars
        .into_iter()
        .enumerate()
        .map(|(i, jar)| McVersion {
            java_major: Some(required_java_for_mc(&jar.version)),
            id: jar.version,
            version_type: "release".to_string(),
            latest: i == 0,
        })
        .collect())
}

/// Resuelve la descarga de un `server.jar` de Spigot.
async fn spigot_download(client: &reqwest::Client, mc: &str) -> AppResult<(String, Option<String>)> {
    let jars = spigot_jars(client).await?;
    let jar = jars
        .into_iter()
        .find(|j| j.version == mc)
        .ok_or_else(|| AppError::Message(format!("Spigot no tiene build para {mc}")))?;
    Ok((format!("{GETBUKKIT_CDN}{}", jar.download_url), jar.sha256))
}

/// Descarga resuelta de un servidor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadKind {
    /// Un `server.jar` listo para `-jar`.
    Jar,
    /// Un instalador que debe ejecutarse (`--installServer`).
    Installer,
}

#[derive(Debug, Clone)]
pub struct ServerDownload {
    pub url: String,
    pub sha256: Option<String>,
    pub java_major: u32,
    pub kind: DownloadKind,
}

/// Resuelve la descarga del `server.jar` para un tipo y versión dados.
pub async fn resolve_server_download(
    client: &reqwest::Client,
    server_type: ServerType,
    mc: &str,
    build: Option<u32>,
    loader_version: Option<&str>,
) -> AppResult<ServerDownload> {
    match server_type {
        ServerType::Vanilla => {
            let (url, java_major) = vanilla_server(client, mc).await?;
            Ok(ServerDownload {
                url,
                sha256: None,
                java_major,
                kind: DownloadKind::Jar,
            })
        }
        ServerType::Paper => {
            let b = match build {
                Some(b) => b,
                None => paper_builds(client, mc)
                    .await?
                    .first()
                    .and_then(|x| x.id.parse().ok())
                    .ok_or_else(|| AppError::Message(format!("Paper no tiene builds para {mc}")))?,
            };
            let (url, sha256) = paper_build(client, mc, b).await?;
            Ok(ServerDownload {
                url,
                sha256,
                java_major: required_java_for_mc(mc),
                kind: DownloadKind::Jar,
            })
        }
        ServerType::Spigot => {
            let (url, sha256) = spigot_download(client, mc).await?;
            Ok(ServerDownload {
                url,
                sha256,
                java_major: required_java_for_mc(mc),
                kind: DownloadKind::Jar,
            })
        }
        ServerType::Fabric => {
            let loader = loader_version
                .ok_or_else(|| AppError::Message("Falta la versión del loader de Fabric".into()))?;
            Ok(ServerDownload {
                url: fabric_server_url(mc, loader),
                sha256: None,
                java_major: required_java_for_mc(mc),
                kind: DownloadKind::Jar,
            })
        }
        ServerType::NeoForge => {
            let loader = loader_version
                .ok_or_else(|| AppError::Message("Falta la versión de NeoForge".into()))?;
            Ok(ServerDownload {
                url: neoforge_installer_url(loader),
                sha256: None,
                java_major: required_java_for_mc(mc),
                kind: DownloadKind::Installer,
            })
        }
        ServerType::Forge => {
            let loader = loader_version
                .ok_or_else(|| AppError::Message("Falta la versión de Forge".into()))?;
            Ok(ServerDownload {
                url: forge_installer_url(mc, loader),
                sha256: None,
                java_major: required_java_for_mc(mc),
                kind: DownloadKind::Installer,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// Fabric
// ---------------------------------------------------------------------------

const FABRIC_META: &str = "https://meta.fabricmc.net/v2/versions";

#[derive(Deserialize)]
struct FabricGameVersion {
    version: String,
    #[serde(default)]
    stable: bool,
}

#[derive(Deserialize)]
struct FabricLoaderVersion {
    version: String,
    #[serde(default)]
    stable: bool,
}

async fn fabric_game_versions(client: &reqwest::Client) -> AppResult<Vec<McVersion>> {
    let list: Vec<FabricGameVersion> = get_json(client, &format!("{FABRIC_META}/game")).await?;
    Ok(list
        .into_iter()
        .enumerate()
        .filter(|(_, v)| v.stable)
        .map(|(i, v)| McVersion {
            java_major: Some(required_java_for_mc(&v.version)),
            id: v.version,
            version_type: "release".into(),
            latest: i == 0,
        })
        .collect())
}

async fn fabric_loader_versions(client: &reqwest::Client) -> AppResult<Vec<BuildInfo>> {
    let list: Vec<FabricLoaderVersion> =
        get_json(client, &format!("{FABRIC_META}/loader")).await?;
    Ok(list
        .into_iter()
        .map(|v| BuildInfo {
            channel: Some(if v.stable { "stable" } else { "beta" }.to_string()),
            released_at: None,
            id: v.version,
        })
        .collect())
}

pub fn fabric_server_url(game: &str, loader: &str) -> String {
    format!("{FABRIC_META}/loader/{game}/{loader}/server/jar")
}

// ---------------------------------------------------------------------------
// NeoForge
// ---------------------------------------------------------------------------

const NEOFORGE_META: &str =
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";

/// Prefijo de versión de NeoForge para una versión de Minecraft.
fn neoforge_prefix(mc: &str) -> Option<String> {
    let parts: Vec<&str> = mc.split('.').collect();
    match parts.as_slice() {
        ["1", minor, patch, ..] => Some(format!("{minor}.{patch}")),
        ["1", minor] => Some(format!("{minor}.0")),
        [major, minor, ..] => {
            let m: u32 = major.parse().ok()?;
            (m >= 26).then(|| format!("{major}.{minor}"))
        }
        _ => None,
    }
}

fn xml_versions(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<version>") {
        let after = &rest[start + "<version>".len()..];
        if let Some(end) = after.find("</version>") {
            out.push(after[..end].trim().to_string());
            rest = &after[end..];
        } else {
            break;
        }
    }
    out
}

async fn neoforge_loader_versions(client: &reqwest::Client, mc: &str) -> AppResult<Vec<BuildInfo>> {
    let prefix = neoforge_prefix(mc)
        .ok_or_else(|| AppError::Message(format!("Versión de Minecraft no válida: {mc}")))?;
    let xml = get_text(client, NEOFORGE_META).await?;
    let mut versions: Vec<String> = xml_versions(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&format!("{prefix}.")))
        .collect();
    versions.reverse();
    Ok(versions
        .into_iter()
        .map(|id| BuildInfo {
            channel: None,
            released_at: None,
            id,
        })
        .collect())
}

pub fn neoforge_installer_url(version: &str) -> String {
    format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{version}/neoforge-{version}-installer.jar"
    )
}

// ---------------------------------------------------------------------------
// Forge
// ---------------------------------------------------------------------------

const FORGE_META: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json";

async fn forge_mc_versions(client: &reqwest::Client) -> AppResult<Vec<McVersion>> {
    let map: std::collections::BTreeMap<String, Vec<String>> =
        get_json(client, FORGE_META).await?;
    let mut keys: Vec<String> = map.keys().cloned().collect();
    keys.sort_by(|a, b| compare_mc_versions(b, a));
    Ok(keys
        .into_iter()
        .enumerate()
        .map(|(i, id)| McVersion {
            java_major: Some(required_java_for_mc(&id)),
            id,
            version_type: "release".into(),
            latest: i == 0,
        })
        .collect())
}

async fn forge_loader_versions(client: &reqwest::Client, mc: &str) -> AppResult<Vec<BuildInfo>> {
    let map: std::collections::BTreeMap<String, Vec<String>> =
        get_json(client, FORGE_META).await?;
    let mut entries = map.get(mc).cloned().unwrap_or_default();
    // Los metadatos vienen de la más antigua a la más reciente; ordenamos
    // descendente para que la primera (la selección por defecto) sea la última.
    entries.sort_by(|a, b| {
        let fa = a.rsplit_once('-').map(|(_, v)| v).unwrap_or(a.as_str());
        let fb = b.rsplit_once('-').map(|(_, v)| v).unwrap_or(b.as_str());
        compare_mc_versions(fb, fa)
    });
    Ok(entries
        .into_iter()
        .enumerate()
        .map(|(i, full)| {
            let id = full
                .rsplit_once('-')
                .map(|(_, v)| v.to_string())
                .unwrap_or(full);
            BuildInfo {
                channel: if i == 0 {
                    Some("latest".to_string())
                } else {
                    None
                },
                released_at: None,
                id,
            }
        })
        .collect())
}

pub fn forge_installer_url(mc: &str, forge: &str) -> String {
    format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{forge}/forge-{mc}-{forge}-installer.jar"
    )
}

/// Compara versiones tipo `1.21.4` o `26.1`.
fn compare_mc_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let pa: Vec<u32> = a.split('.').filter_map(|p| p.parse().ok()).collect();
    let pb: Vec<u32> = b.split('.').filter_map(|p| p.parse().ok()).collect();
    pa.cmp(&pb)
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

pub async fn list_versions(client: &reqwest::Client, server_type: ServerType) -> AppResult<Vec<McVersion>> {
    match server_type {
        ServerType::Vanilla => vanilla_versions(client).await,
        ServerType::Paper => paper_versions(client).await,
        ServerType::Spigot => spigot_versions(client).await,
        ServerType::Fabric => fabric_game_versions(client).await,
        ServerType::NeoForge => {
            let all = vanilla_versions(client).await?;
            Ok(all
                .into_iter()
                .filter(|v| v.version_type == "release")
                .collect())
        }
        ServerType::Forge => forge_mc_versions(client).await,
    }
}

pub async fn list_builds(
    client: &reqwest::Client,
    server_type: ServerType,
    mc: &str,
) -> AppResult<Vec<BuildInfo>> {
    match server_type {
        ServerType::Paper => paper_builds(client, mc).await,
        ServerType::Spigot => Ok(Vec::new()),
        ServerType::Vanilla => Ok(Vec::new()),
        ServerType::Fabric => fabric_loader_versions(client).await,
        ServerType::NeoForge => neoforge_loader_versions(client, mc).await,
        ServerType::Forge => forge_loader_versions(client, mc).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn java_table() {
        assert_eq!(required_java_for_mc("1.16.5"), 8);
        assert_eq!(required_java_for_mc("1.12.2"), 8);
        assert_eq!(required_java_for_mc("1.17.1"), 16);
        assert_eq!(required_java_for_mc("1.18"), 17);
        assert_eq!(required_java_for_mc("1.20.4"), 17);
        assert_eq!(required_java_for_mc("1.20.5"), 21);
        assert_eq!(required_java_for_mc("1.21.8"), 21);
        assert_eq!(required_java_for_mc("26.1"), 21);
    }
}
