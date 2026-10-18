use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::io::Read;
use base64::Engine;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::instance::Instance;

/// Carpeta de contenido (plugins/mods) según el tipo de servidor.
pub fn content_dir(instance: &Instance, dir: &Path) -> Option<PathBuf> {
    if instance.server_type.is_plugin() {
        Some(dir.join("plugins"))
    } else if instance.server_type.is_modded() {
        Some(dir.join("mods"))
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Gestión local de archivos
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFile {
    /// Nombre real en disco (puede acabar en `.disabled`).
    pub name: String,
    /// Nombre para mostrar (sin `.disabled`).
    pub display: String,
    pub size: u64,
    pub enabled: bool,
    pub project_name: Option<String>,
    pub icon_url: Option<String>,
}

// Read bounded entries in memory; never extract untrusted JAR paths to disk.
fn jar_entry(archive: &mut zip::ZipArchive<std::fs::File>, name: &str, limit: u64) -> Option<Vec<u8>> {
    let entry = archive.by_name(name.trim_start_matches('/')).ok()?;
    if entry.size() > limit { return None; }
    let mut bytes = Vec::new();
    entry.take(limit + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= limit).then_some(bytes)
}

fn jar_identity(path: &Path) -> (Option<String>, Option<String>) {
    let Some(mut archive) = std::fs::File::open(path).ok().and_then(|f| zip::ZipArchive::new(f).ok()) else {
        return (None, None);
    };
    let mut name = None;
    let mut logo = None;
    if let Some(data) = jar_entry(&mut archive, "fabric.mod.json", 256 * 1024) {
        if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&data) {
            name = value["name"].as_str().map(str::to_owned);
            logo = value["icon"].as_str().map(str::to_owned).or_else(|| {
                value["icon"].as_object()?.iter()
                    .filter_map(|(size, path)| Some((size.parse::<u32>().ok()?, path.as_str()?)))
                    .max_by_key(|(size, _)| *size).map(|(_, path)| path.to_owned())
            });
        }
    }
    for manifest in ["META-INF/neoforge.mods.toml", "META-INF/mods.toml"] {
        if let Some(data) = jar_entry(&mut archive, manifest, 256 * 1024) {
            if let Ok(value) = String::from_utf8_lossy(&data).parse::<toml::Value>() {
                if let Some(first) = value.get("mods").and_then(|v| v.as_array()).and_then(|a| a.first()) {
                    name = name.or_else(|| first.get("displayName")?.as_str().map(str::to_owned));
                    logo = logo.or_else(|| first.get("logoFile").or_else(|| value.get("logoFile"))?.as_str().map(str::to_owned));
                }
            }
        }
    }
    let icon = logo.and_then(|path| {
        let bytes = jar_entry(&mut archive, &path, 2 * 1024 * 1024)?;
        let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { "image/png" }
            else if bytes.starts_with(b"\xff\xd8\xff") { "image/jpeg" }
            else if bytes.starts_with(b"GIF8") { "image/gif" }
            else { return None; };
        Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
    });
    (name, icon)
}

pub fn list_files(dir: &Path) -> AppResult<Vec<ContentFile>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".jar") && !name.ends_with(".jar.disabled") {
            continue;
        }
        let enabled = !name.ends_with(".disabled");
        let display = name.trim_end_matches(".disabled").to_string();
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let (project_name, icon_url) = jar_identity(&path);
        out.push(ContentFile {
            name,
            display,
            size,
            enabled,
            project_name,
            icon_url,
        });
    }
    out.sort_by(|a, b| a.display.to_lowercase().cmp(&b.display.to_lowercase()));
    Ok(out)
}

/// Activa o desactiva un archivo renombrándolo a `.disabled`.
pub fn toggle_file(dir: &Path, name: &str) -> AppResult<()> {
    let src = dir.join(name);
    if !src.exists() {
        return Err(AppError::NotFound(name.to_string()));
    }
    let dst = if name.ends_with(".disabled") {
        dir.join(name.trim_end_matches(".disabled"))
    } else {
        dir.join(format!("{name}.disabled"))
    };
    std::fs::rename(src, dst)?;
    Ok(())
}

pub fn delete_file(dir: &Path, name: &str) -> AppResult<()> {
    let path = dir.join(name);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

pub fn copy_file_in(dir: &Path, src: &Path) -> AppResult<String> {
    crate::paths::ensure_dir(dir)?;
    let file_name = src
        .file_name()
        .ok_or_else(|| AppError::Message("Ruta de archivo no válida".into()))?
        .to_string_lossy()
        .to_string();
    std::fs::copy(src, dir.join(&file_name))?;
    Ok(file_name)
}

// ---------------------------------------------------------------------------
// Índice de contenido instalado (proyecto -> archivo)
// ---------------------------------------------------------------------------

pub const CONTENT_INDEX: &str = "mla-content.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentIndexEntry {
    pub source: String,
    pub project_id: String,
    pub file: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ContentIndex {
    #[serde(default)]
    entries: Vec<ContentIndexEntry>,
}

fn index_path(dir: &Path) -> PathBuf {
    dir.join(CONTENT_INDEX)
}

fn read_index(dir: &Path) -> ContentIndex {
    std::fs::read_to_string(index_path(dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Registra los archivos instalados de un proyecto para recordar su origen.
pub fn record_install(dir: &Path, source: &str, installed: &[(String, String)]) -> AppResult<()> {
    let mut index = read_index(dir);
    for (project_id, file) in installed {
        index
            .entries
            .retain(|e| !(e.source == source && &e.project_id == project_id));
        index.entries.push(ContentIndexEntry {
            source: source.to_string(),
            project_id: project_id.clone(),
            file: file.clone(),
        });
    }
    crate::paths::ensure_dir(dir)?;
    std::fs::write(index_path(dir), serde_json::to_string_pretty(&index)?)?;
    Ok(())
}

/// Identidades (`fuente:proyecto`) instaladas cuyo archivo sigue presente.
pub fn installed_ids(dir: &Path, target: &Path) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for entry in read_index(dir).entries {
        if target.join(&entry.file).exists() {
            let id = format!("{}:{}", entry.source, entry.project_id);
            if !out.contains(&id) {
                out.push(id);
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Búsqueda remota
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentProject {
    pub source: String,
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentCategory {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentSource {
    Modrinth,
    Hangar,
    Spiget,
}

impl ContentSource {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "modrinth" => Ok(Self::Modrinth),
            "hangar" => Ok(Self::Hangar),
            "spiget" => Ok(Self::Spiget),
            other => Err(AppError::Message(format!("Fuente desconocida: {other}"))),
        }
    }
}

fn modrinth_loaders(instance: &Instance) -> Vec<&'static str> {
    match instance.server_type {
        crate::instance::ServerType::Fabric => vec!["fabric"],
        crate::instance::ServerType::NeoForge => vec!["neoforge"],
        crate::instance::ServerType::Forge => vec!["forge"],
        crate::instance::ServerType::Paper => vec!["paper", "spigot", "bukkit"],
        crate::instance::ServerType::Spigot => vec!["spigot", "bukkit"],
        crate::instance::ServerType::Vanilla => vec![],
    }
}

/// Opciones de búsqueda de contenido.
#[derive(Debug, Clone, Default)]
pub struct SearchOptions {
    pub query: String,
    pub page: u32,
    pub category: Option<String>,
    /// "downloads" | "relevance" | "updated" | "newest"
    pub sort: Option<String>,
}

const CONTENT_PAGE_SIZE: u32 = 20;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentSearchPage {
    pub projects: Vec<ContentProject>,
    pub total: Option<u64>,
    pub has_more: bool,
}

fn search_page(projects: Vec<ContentProject>, total: Option<u64>, page: u32) -> ContentSearchPage {
    let end = u64::from(page) * u64::from(CONTENT_PAGE_SIZE) + projects.len() as u64;
    let has_more = total.map_or(projects.len() == CONTENT_PAGE_SIZE as usize, |total| end < total);
    ContentSearchPage { projects, total, has_more }
}

pub async fn search(
    client: &reqwest::Client,
    instance: &Instance,
    source: ContentSource,
    options: &SearchOptions,
) -> AppResult<ContentSearchPage> {
    match source {
        ContentSource::Modrinth => search_modrinth(client, instance, options).await,
        ContentSource::Hangar => search_hangar(client, options).await,
        ContentSource::Spiget => search_spiget(client, options).await,
    }
}

/// Lista las categorías disponibles para una fuente.
pub async fn categories(
    client: &reqwest::Client,
    instance: &Instance,
    source: ContentSource,
) -> AppResult<Vec<ContentCategory>> {
    match source {
        ContentSource::Modrinth => modrinth_categories(client, instance).await,
        ContentSource::Hangar => hangar_categories(client).await,
        ContentSource::Spiget => spiget_categories(client).await,
    }
}

// --- Modrinth ---------------------------------------------------------------

#[derive(Deserialize)]
struct MrSearch {
    hits: Vec<MrHit>,
    total_hits: u64,
}

#[derive(Deserialize)]
struct MrHit {
    project_id: String,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    icon_url: Option<String>,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    author: Option<String>,
}

fn modrinth_selectors(instance: &Instance) -> Vec<String> {
    let project_type = if instance.server_type.is_plugin() {
        "plugin"
    } else {
        "mod"
    };
    let mut groups: Vec<String> = vec![format!("[\"project_type:{project_type}\"]")];
    let loaders = modrinth_loaders(instance);
    if !loaders.is_empty() {
        let ors: Vec<String> = loaders
            .iter()
            .map(|l| format!("\"categories:{l}\""))
            .collect();
        groups.push(format!("[{}]", ors.join(",")));
    }
    groups.push(format!("[\"versions:{}\"]", instance.mc_version));
    groups
}

async fn search_modrinth(
    client: &reqwest::Client,
    instance: &Instance,
    options: &SearchOptions,
) -> AppResult<ContentSearchPage> {
    let mut facet_groups = modrinth_selectors(instance);
    if let Some(category) = options.category.as_deref().filter(|c| !c.is_empty()) {
        facet_groups.push(format!("[\"categories:{category}\"]"));
    }
    let facets = format!("[{}]", facet_groups.join(","));

    let index = match options.sort.as_deref() {
        Some("relevance") => "relevance",
        Some("updated") => "updated",
        Some("newest") => "newest",
        _ => "downloads",
    };

    let resp: MrSearch = client
        .get("https://api.modrinth.com/v2/search")
        .query(&[
            ("query", options.query.as_str()),
            ("limit", "20"),
            ("offset", &(options.page * CONTENT_PAGE_SIZE).to_string()),
            ("index", index),
            ("facets", facets.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let total = resp.total_hits;
    let projects = resp
        .hits
        .into_iter()
        .map(|h| ContentProject {
            source: "modrinth".into(),
            id: h.project_id,
            name: h.title,
            description: h.description,
            icon_url: h.icon_url,
            downloads: h.downloads,
            author: h.author,
        })
        .collect();
    Ok(search_page(projects, Some(total), options.page))
}

#[derive(Deserialize)]
struct MrTag {
    name: String,
    #[serde(default)]
    project_type: Option<String>,
}

async fn modrinth_categories(
    client: &reqwest::Client,
    instance: &Instance,
) -> AppResult<Vec<ContentCategory>> {
    let want = if instance.server_type.is_plugin() {
        "plugin"
    } else {
        "mod"
    };
    let tags: Vec<MrTag> = client
        .get("https://api.modrinth.com/v2/tag/category")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(tags
        .into_iter()
        .filter(|t| t.project_type.as_deref().map(|p| p == want).unwrap_or(true))
        .map(|t| ContentCategory {
            id: t.name.clone(),
            name: t.name,
        })
        .collect())
}

#[derive(Deserialize)]
struct MrVersion {
    files: Vec<MrFile>,
    #[serde(default)]
    dependencies: Vec<MrDependency>,
}

#[derive(Deserialize)]
struct MrFile {
    url: String,
    filename: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Deserialize)]
struct MrDependency {
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    dependency_type: Option<String>,
}

/// Resuelve el archivo a descargar de un proyecto y sus dependencias requeridas.
async fn modrinth_resolve(
    client: &reqwest::Client,
    instance: &Instance,
    project_id: &str,
) -> AppResult<(String, String, Vec<String>)> {
    let loaders = modrinth_loaders(instance);
    let loaders_json = format!(
        "[{}]",
        loaders
            .iter()
            .map(|l| format!("\"{l}\""))
            .collect::<Vec<_>>()
            .join(",")
    );
    let game_versions = format!("[\"{}\"]", instance.mc_version);

    let versions: Vec<MrVersion> = client
        .get(format!("https://api.modrinth.com/v2/project/{project_id}/version"))
        .query(&[
            ("loaders", loaders_json.as_str()),
            ("game_versions", game_versions.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let version = versions
        .into_iter()
        .find(|v| !v.files.is_empty())
        .ok_or_else(|| AppError::Message("No hay versión compatible.".into()))?;

    let file = version
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| version.files.first())
        .ok_or_else(|| AppError::Message("La versión no tiene archivos.".into()))?;
    let url = file.url.clone();
    let filename = file.filename.clone();

    let dependencies = version
        .dependencies
        .into_iter()
        .filter(|d| d.dependency_type.as_deref() == Some("required"))
        .filter_map(|d| d.project_id)
        .collect();

    Ok((url, filename, dependencies))
}

/// Resuelve y descarga un único proyecto de Modrinth, devolviendo su archivo y
/// las dependencias requeridas.
async fn modrinth_install_one<F>(
    client: &reqwest::Client,
    instance: &Instance,
    dir: &Path,
    project_id: &str,
    on_progress: &mut F,
) -> AppResult<(String, Vec<String>)>
where
    F: FnMut(u64, Option<u64>),
{
    let (url, filename, deps) = modrinth_resolve(client, instance, project_id).await?;
    crate::download::download_file(client, &url, &dir.join(&filename), None, on_progress).await?;
    Ok((filename, deps))
}

/// Instala un proyecto de Modrinth y, en cascada, sus dependencias requeridas.
/// Devuelve pares `(project_id, archivo)`.
async fn modrinth_install_tree<F>(
    client: &reqwest::Client,
    instance: &Instance,
    dir: &Path,
    root: &str,
    mut on_progress: F,
) -> AppResult<Vec<(String, String)>>
where
    F: FnMut(u64, Option<u64>),
{
    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut queue: Vec<String> = vec![root.to_string()];
    let mut installed: Vec<(String, String)> = Vec::new();
    let mut is_root = true;

    while let Some(project_id) = queue.pop() {
        if !visited.insert(project_id.clone()) {
            continue;
        }

        match modrinth_install_one(client, instance, dir, &project_id, &mut on_progress).await {
            Ok((filename, deps)) => {
                installed.push((project_id.clone(), filename));
                for dep in deps {
                    if !visited.contains(&dep) {
                        queue.push(dep);
                    }
                }
            }
            Err(e) => {
                // El proyecto principal debe instalarse; las dependencias que
                // fallen simplemente se omiten.
                if is_root {
                    return Err(e);
                }
            }
        }
        is_root = false;
    }

    Ok(installed)
}

// --- Hangar -----------------------------------------------------------------

#[derive(Deserialize)]
struct HgSearch {
    #[serde(default)]
    result: Vec<HgHit>,
    pagination: HgPagination,
}

#[derive(Deserialize)]
struct HgPagination {
    count: u64,
}

#[derive(Deserialize)]
struct HgHit {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default, rename = "avatarUrl")]
    avatar_url: Option<String>,
    namespace: HgNamespace,
    #[serde(default)]
    stats: Option<HgStats>,
}

#[derive(Deserialize)]
struct HgNamespace {
    owner: String,
    slug: String,
}

#[derive(Deserialize)]
struct HgStats {
    #[serde(default)]
    downloads: u64,
}

async fn search_hangar(
    client: &reqwest::Client,
    options: &SearchOptions,
) -> AppResult<ContentSearchPage> {
    let sort = match options.sort.as_deref() {
        Some("relevance") => None,
        Some("updated") => Some("-updated"),
        Some("newest") => Some("-newest"),
        _ => Some("-downloads"),
    };

    let mut params: Vec<(&str, String)> = vec![
        ("platform", "PAPER".to_string()),
        ("limit", "20".to_string()),
        ("offset", (options.page * CONTENT_PAGE_SIZE).to_string()),
    ];
    if !options.query.is_empty() {
        params.push(("query", options.query.clone()));
    }
    if let Some(s) = sort {
        params.push(("sort", s.to_string()));
    }
    if let Some(c) = options.category.as_deref().filter(|c| !c.is_empty()) {
        params.push(("category", c.to_string()));
    }

    let resp: HgSearch = client
        .get("https://hangar.papermc.io/api/v1/projects")
        .query(&params)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let total = resp.pagination.count;
    let projects = resp
        .result
        .into_iter()
        .map(|h| ContentProject {
            source: "hangar".into(),
            id: format!("{}/{}", h.namespace.owner, h.namespace.slug),
            name: h.name,
            description: h.description.unwrap_or_default(),
            icon_url: h.avatar_url,
            downloads: h.stats.map(|s| s.downloads).unwrap_or(0),
            author: Some(h.namespace.owner),
        })
        .collect();
    Ok(search_page(projects, Some(total), options.page))
}

async fn hangar_categories(client: &reqwest::Client) -> AppResult<Vec<ContentCategory>> {
    let list: Vec<serde_json::Value> = client
        .get("https://hangar.papermc.io/api/v1/categories")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(list
        .into_iter()
        .filter_map(|item| {
            if item.get("is_sub").and_then(|v| v.as_bool()).unwrap_or(false) {
                return None;
            }
            let name = item.get("name")?.as_str()?.to_string();
            Some(ContentCategory {
                id: name.clone(),
                name,
            })
        })
        .collect())
}

#[derive(Deserialize)]
struct HgVersions {
    #[serde(default)]
    result: Vec<HgVersion>,
}

#[derive(Deserialize)]
struct HgVersion {
    #[serde(default)]
    downloads: HashMap<String, HgDownload>,
}

#[derive(Deserialize)]
struct HgDownload {
    url: String,
}

async fn hangar_download(
    client: &reqwest::Client,
    project_id: &str,
) -> AppResult<(String, String)> {
    let slug = project_id
        .split_once('/')
        .map(|(_, s)| s)
        .unwrap_or(project_id);
    let resp: HgVersions = client
        .get(format!(
            "https://hangar.papermc.io/api/v1/projects/{slug}/versions"
        ))
        .query(&[("platform", "PAPER"), ("limit", "5")])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    for version in resp.result {
        if let Some(dl) = version
            .downloads
            .get("PAPER")
            .or_else(|| version.downloads.values().next())
        {
            let name = dl
                .url
                .rsplit('/')
                .next()
                .filter(|s| s.ends_with(".jar"))
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{slug}.jar"));
            return Ok((dl.url.clone(), name));
        }
    }
    Err(AppError::Message(
        "No se encontró una descarga para Hangar.".into(),
    ))
}

// --- Spiget -----------------------------------------------------------------

#[derive(Deserialize)]
struct SpigetResource {
    id: i64,
    name: String,
    #[serde(default)]
    tag: Option<String>,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    premium: bool,
    #[serde(default)]
    external: bool,
}

async fn search_spiget(
    client: &reqwest::Client,
    options: &SearchOptions,
) -> AppResult<ContentSearchPage> {
    let url = if !options.query.is_empty() {
        format!(
            "https://api.spiget.org/v2/search/resources/{}",
            options.query
        )
    } else if let Some(category) = options.category.as_deref().filter(|c| !c.is_empty()) {
        format!("https://api.spiget.org/v2/categories/{category}/resources")
    } else {
        "https://api.spiget.org/v2/resources".to_string()
    };

    let response = client
        .get(url)
        .query(&[("size", "20"), ("sort", "-downloads"), ("page", &(options.page + 1).to_string())])
        .send()
        .await?
        .error_for_status()?;
    let total = response.headers().get("x-total")
        .and_then(|value| value.to_str().ok()).and_then(|value| value.parse::<u64>().ok());
    let list: Vec<SpigetResource> = response.json().await?;

    let projects = list
        .into_iter()
        .map(|r| ContentProject {
            source: "spiget".into(),
            id: r.id.to_string(),
            name: r.name,
            description: r.tag.unwrap_or_default(),
            icon_url: None,
            downloads: r.downloads,
            author: None,
        })
        .collect();
    Ok(search_page(projects, total, options.page))
}

async fn spiget_categories(client: &reqwest::Client) -> AppResult<Vec<ContentCategory>> {
    let list: Vec<serde_json::Value> = client
        .get("https://api.spiget.org/v2/categories")
        .query(&[("size", "1000")])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(list
        .into_iter()
        .filter(|item| item.get("parent").is_none_or(|p| p.is_null()))
        .filter_map(|item| {
            let id = item.get("id")?.as_u64()?;
            let name = item.get("name")?.as_str()?.to_string();
            Some(ContentCategory {
                id: id.to_string(),
                name,
            })
        })
        .collect())
}

async fn spiget_download(
    client: &reqwest::Client,
    project_id: &str,
) -> AppResult<(String, String)> {
    let resource: SpigetResource = client
        .get(format!("https://api.spiget.org/v2/resources/{project_id}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    if resource.premium || resource.external {
        return Err(AppError::Message(
            "Este recurso es premium o externo y no se puede descargar automáticamente."
                .into(),
        ));
    }

    let safe: String = resource
        .name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    Ok((
        format!("https://api.spiget.org/v2/resources/{project_id}/download"),
        format!("{safe}.jar"),
    ))
}

/// Instala la última versión compatible de un proyecto en la carpeta de contenido.
///
/// En Modrinth, las dependencias requeridas se instalan automáticamente.
/// Devuelve la lista de archivos instalados (el primero es el proyecto principal).
pub async fn install<F>(
    client: &reqwest::Client,
    instance: &Instance,
    dir: &Path,
    source: ContentSource,
    project_id: &str,
    on_progress: F,
) -> AppResult<Vec<String>>
where
    F: FnMut(u64, Option<u64>),
{
    let target = content_dir(instance, dir)
        .ok_or_else(|| AppError::Message("Este servidor no admite plugins ni mods.".into()))?;
    crate::paths::ensure_dir(&target)?;

    let (source_key, installed_pairs): (&str, Vec<(String, String)>) = match source {
        ContentSource::Modrinth => (
            "modrinth",
            modrinth_install_tree(client, instance, &target, project_id, on_progress).await?,
        ),
        ContentSource::Hangar | ContentSource::Spiget => {
            let (url, filename) = match source {
                ContentSource::Hangar => hangar_download(client, project_id).await?,
                _ => spiget_download(client, project_id).await?,
            };
            let mut on_progress = on_progress;
            crate::download::download_file(
                client,
                &url,
                &target.join(&filename),
                None,
                &mut on_progress,
            )
            .await?;
            let key = if source == ContentSource::Hangar {
                "hangar"
            } else {
                "spiget"
            };
            (key, vec![(project_id.to_string(), filename)])
        }
    };

    record_install(dir, source_key, &installed_pairs)?;

    Ok(installed_pairs.into_iter().map(|(_, file)| file).collect())
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    use std::io::Write;

    fn fixture(manifest: &str, data: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
        let file = std::fs::File::create(dir.path().join("example.jar.disabled")).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file(manifest, options).unwrap();
        zip.write_all(data.as_bytes()).unwrap();
        zip.start_file("assets/logo.png", options).unwrap();
        zip.write_all(b"\x89PNG\r\n\x1a\nfixture").unwrap();
        zip.finish().unwrap();
        dir
    }

    #[test]
    fn reads_disabled_forge_identity() {
        let dir = fixture("META-INF/mods.toml", "[[mods]]\nmodId='example'\ndisplayName='Example Mod'\nlogoFile='assets/logo.png'\n");
        let files = list_files(dir.path()).unwrap();
        assert_eq!(files[0].project_name.as_deref(), Some("Example Mod"));
        assert!(files[0].icon_url.as_ref().unwrap().starts_with("data:image/png;base64,"));
        assert!(!files[0].enabled);
        toggle_file(dir.path(), &files[0].name).unwrap();
        assert!(list_files(dir.path()).unwrap()[0].enabled);
    }

    #[test]
    fn reads_fabric_size_map() {
        let dir = fixture("fabric.mod.json", r#"{"name":"Fabric Example","icon":{"32":"missing.png","128":"assets/logo.png"}}"#);
        let files = list_files(dir.path()).unwrap();
        assert_eq!(files[0].project_name.as_deref(), Some("Fabric Example"));
        assert!(files[0].icon_url.is_some());
    }

    #[test]
    fn missing_logo_and_invalid_jar_do_not_break_listing() {
        let dir = fixture("META-INF/neoforge.mods.toml", "[[mods]]\ndisplayName='Neo Example'\nlogoFile='missing.png'");
        std::fs::write(dir.path().join("broken.jar"), b"not a jar").unwrap();
        let files = list_files(dir.path()).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|file| file.icon_url.is_none()));
        assert!(files.iter().any(|file| file.project_name.as_deref() == Some("Neo Example")));
    }
}


#[cfg(test)]
mod pagination_tests {
    use super::*;

    fn projects(count: usize) -> Vec<ContentProject> {
        (0..count).map(|id| ContentProject {
            source: "modrinth".into(), id: id.to_string(), name: "Example".into(),
            description: String::new(), icon_url: None, downloads: 0, author: None,
        }).collect()
    }

    #[test]
    fn next_page_stops_at_exact_and_partial_boundaries() {
        assert!(search_page(projects(20), Some(40), 0).has_more);
        assert!(!search_page(projects(20), Some(40), 1).has_more);
        assert!(!search_page(projects(3), Some(43), 2).has_more);
        assert!(!search_page(projects(0), Some(0), 0).has_more);
    }

    #[test]
    fn missing_total_falls_back_to_page_length() {
        assert!(search_page(projects(20), None, 0).has_more);
        assert!(!search_page(projects(5), None, 1).has_more);
    }

    #[test]
    fn provider_totals_are_deserialized() {
        let mr: MrSearch = serde_json::from_str(r#"{"hits":[],"total_hits":42}"#).unwrap();
        let hg: HgSearch = serde_json::from_str(r#"{"result":[],"pagination":{"count":42,"offset":20,"limit":20}}"#).unwrap();
        assert_eq!(mr.total_hits, 42);
        assert_eq!(hg.pagination.count, 42);
    }
}
