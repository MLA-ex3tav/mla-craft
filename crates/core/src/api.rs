//! Operaciones de alto nivel compartidas por los hosts (GUI Tauri y servidor headless).
//!
//! Cada función corresponde a un comando de la interfaz. Los hosts solo se encargan
//! de transportar la llamada y los eventos.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::instance::{self, Instance, InstanceView, NewInstanceRequest};
use crate::state::AppState;
use crate::{
    backup, config, content, download, events, java, mrpack, paths, player_live, player_snapshot,
    players, process, providers,
};

// ---------------------------------------------------------------------------
// Tipos de entrada/salida
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub os: String,
    pub arch: String,
    pub app_data_dir: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSettings {
    pub memory_min_mb: u32,
    pub memory_max_mb: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    pub port: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSettings {
    pub backup_interval_minutes: Option<u32>,
    pub backup_retention: Option<u32>,
    pub restart_interval_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Address {
    pub name: String,
    pub description: String,
    pub ip: String,
    #[serde(default)]
    pub network: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connections {
    pub addresses: Vec<Address>,
    pub port: u16,
    pub bind_ip: String,
}

// ---------------------------------------------------------------------------
// Helpers de eventos
// ---------------------------------------------------------------------------

fn progress(state: &AppState, id: &str, phase_name: &str, downloaded: u64, total: Option<u64>, message: Option<String>) {
    state.bus.progress(&events::TaskProgress {
        id: id.to_string(),
        phase: phase_name.to_string(),
        downloaded,
        total,
        percent: events::percent(downloaded, total),
        message,
    });
}

fn phase(state: &AppState, id: &str, name: &str, message: impl Into<String>) {
    state.bus.progress(&events::phase(id, name, message));
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

pub fn app_info(state: &AppState) -> AppInfo {
    AppInfo {
        name: "MLA Server".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        app_data_dir: state.data_dir.to_string_lossy().to_string(),
    }
}

// ---------------------------------------------------------------------------
// Instancias
// ---------------------------------------------------------------------------

pub fn list_instances(state: &AppState) -> AppResult<Vec<InstanceView>> {
    instance::list_instances(&state.data_dir)
}

pub fn get_instance(state: &AppState, id: &str) -> AppResult<InstanceView> {
    instance::get_instance(&state.data_dir, id)
}

pub fn create_instance(state: &AppState, request: NewInstanceRequest) -> AppResult<InstanceView> {
    instance::create_instance(&state.data_dir, request)
}

pub fn update_instance(state: &AppState, config_value: Instance, dir: &str) -> AppResult<InstanceView> {
    instance::update_instance(&state.data_dir, config_value, Path::new(dir))
}

pub fn delete_instance(state: &AppState, id: &str, delete_files: bool) -> AppResult<()> {
    instance::delete_instance(&state.data_dir, id, delete_files)
}

// ---------------------------------------------------------------------------
// Versiones
// ---------------------------------------------------------------------------

pub async fn list_mc_versions(
    state: &AppState,
    server_type: instance::ServerType,
) -> AppResult<Vec<providers::McVersion>> {
    providers::list_versions(&state.http, server_type).await
}

pub async fn list_builds(
    state: &AppState,
    server_type: instance::ServerType,
    mc: &str,
) -> AppResult<Vec<providers::BuildInfo>> {
    providers::list_builds(&state.http, server_type, mc).await
}

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

pub fn list_java_runtimes(state: &AppState) -> Vec<java::JavaRuntime> {
    java::list_runtimes(&state.data_dir)
}

pub fn system_memory_mb() -> u64 {
    java::system_memory_mb()
}

pub async fn ensure_java_runtime(state: &AppState, major: u32) -> AppResult<java::JavaRuntime> {
    let base = state.clone();
    let state_prog = state.clone();
    java::ensure_java(&base.http, &base.data_dir, major, move |downloaded, total| {
        progress(
            &state_prog,
            &format!("java-{major}"),
            "java",
            downloaded,
            total,
            Some(format!("Instalando Java {major}")),
        );
    })
    .await
}

// ---------------------------------------------------------------------------
// Servidor (instalación / EULA)
// ---------------------------------------------------------------------------

const EULA_CONTENT: &str =
    "# Al usar este servidor aceptas el EULA de Minecraft:\n# https://aka.ms/MinecraftEULA\n";

fn write_eula(dir: &Path, accepted: bool) -> AppResult<()> {
    std::fs::write(dir.join("eula.txt"), format!("{EULA_CONTENT}eula={accepted}\n"))?;
    Ok(())
}

pub async fn install_server(state: &AppState, id: &str) -> AppResult<InstanceView> {
    let view = instance::get_instance(&state.data_dir, id)?;
    let dir = PathBuf::from(&view.dir);
    paths::ensure_dir(&dir)?;

    phase(state, id, "resolve", "Resolviendo descarga…");
    let download_info = providers::resolve_server_download(
        &state.http,
        view.config.server_type,
        &view.config.mc_version,
        view.config.build,
        view.config.loader_version.as_deref(),
    )
    .await?;

    phase(state, id, "java", format!("Preparando Java {}", download_info.java_major));
    let state_java = state.clone();
    let id_java = id.to_string();
    let java_runtime = java::ensure_java(
        &state.http,
        &state.data_dir,
        download_info.java_major,
        move |downloaded, total| {
            progress(&state_java, &id_java, "java", downloaded, total, None);
        },
    )
    .await?;

    let state_dl = state.clone();
    let id_dl = id.to_string();
    let on_dl = move |downloaded: u64, total: Option<u64>| {
        progress(&state_dl, &id_dl, "download", downloaded, total, None);
    };

    match download_info.kind {
        providers::DownloadKind::Jar => {
            phase(state, id, "download", "Descargando servidor…");
            download::download_file(
                &state.http,
                &download_info.url,
                &dir.join("server.jar"),
                download_info.sha256.as_deref(),
                on_dl,
            )
            .await?;
        }
        providers::DownloadKind::Installer => {
            phase(state, id, "download", "Descargando instalador…");
            let installer = dir.join("installer.jar");
            download::download_file(&state.http, &download_info.url, &installer, None, on_dl).await?;
            phase(state, id, "install", "Ejecutando instalador…");
            process::run_installer(state, id, &java_runtime.path, &dir, "installer.jar").await?;
            let _ = std::fs::remove_file(&installer);
        }
    }

    phase(state, id, "configure", "Preparando configuración…");
    if !dir.join("eula.txt").exists() {
        write_eula(&dir, false)?;
    }
    config::ensure_properties(&dir, view.config.port)?;

    let mut cfg = view.config;
    cfg.installed = true;
    cfg.java_major = Some(java_runtime.major);
    cfg.java_path = Some(java_runtime.path.clone());
    if cfg.mcsr_coop {
        let _ = process::build_command(&cfg, &dir)?;
    }
    let updated = instance::update_instance(&state.data_dir, cfg, &dir)?;

    state.bus.progress(&events::TaskProgress {
        id: id.to_string(),
        phase: "done".into(),
        downloaded: 0,
        total: None,
        percent: 100.0,
        message: Some("Instalación completa".into()),
    });

    Ok(updated)
}

pub fn set_eula(state: &AppState, id: &str, accepted: bool) -> AppResult<()> {
    let view = instance::get_instance(&state.data_dir, id)?;
    write_eula(Path::new(&view.dir), accepted)
}

pub fn get_eula(state: &AppState, id: &str) -> AppResult<bool> {
    let view = instance::get_instance(&state.data_dir, id)?;
    let path = PathBuf::from(view.dir).join("eula.txt");
    if !path.exists() {
        return Ok(false);
    }
    Ok(std::fs::read_to_string(path)?
        .lines()
        .any(|l| l.trim().eq_ignore_ascii_case("eula=true")))
}

// ---------------------------------------------------------------------------
// Proceso
// ---------------------------------------------------------------------------

fn eula_accepted(dir: &Path) -> bool {
    std::fs::read_to_string(dir.join("eula.txt"))
        .map(|t| t.lines().any(|l| l.trim().eq_ignore_ascii_case("eula=true")))
        .unwrap_or(false)
}

pub async fn start_server(state: &AppState, id: &str) -> AppResult<()> {
    if process::is_running(&state.processes, id).await {
        return Err(AppError::Message("El servidor ya está en ejecución.".into()));
    }
    let mut view = instance::get_instance(&state.data_dir, id)?;
    if !view.config.installed {
        return Err(AppError::Message("El servidor no está instalado.".into()));
    }
    let dir = PathBuf::from(&view.dir);
    if !eula_accepted(&dir) {
        return Err(AppError::Message(
            "Debes aceptar el EULA de Minecraft antes de arrancar.".into(),
        ));
    }
    view.config.last_started = Some(chrono::Utc::now().to_rfc3339());
    let _ = instance::update_instance(&state.data_dir, view.config.clone(), &dir);
    process::start(state, &view.config, &dir).await
}

pub async fn stop_server(state: &AppState, id: &str) -> AppResult<()> {
    process::stop(state, id).await
}

pub async fn restart_server(state: &AppState, id: &str) -> AppResult<()> {
    if !process::is_running(&state.processes, id).await {
        return Err(AppError::Message(
            "El servidor debe estar encendido para reiniciarlo.".into(),
        ));
    }
    process::stop(state, id).await?;
    for _ in 0..100 {
        if !process::is_running(&state.processes, id).await {
            return start_server(state, id).await;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err(AppError::Message(
        "El servidor no terminó de detenerse. No se inició otro proceso.".into(),
    ))
}

pub async fn send_server_command(state: &AppState, id: &str, command: &str) -> AppResult<()> {
    process::send_command(&state.processes, id, command).await
}

pub async fn server_status(state: &AppState, id: &str) -> bool {
    process::is_running(&state.processes, id).await
}

pub async fn kill_server(state: &AppState, id: &str) {
    process::kill(&state.processes, id).await;
}

pub async fn online_players(state: &AppState, id: &str) -> AppResult<Vec<String>> {
    if !process::is_running(&state.processes, id).await {
        return Ok(Vec::new());
    }
    {
        let mut map = state
            .online
            .lock()
            .map_err(|_| AppError::Message("Estado de jugadores bloqueado.".into()))?;
        map.entry(id.to_string()).or_default().pending = 8;
    }
    if process::send_command(&state.processes, id, "list").await.is_err() {
        return Ok(Vec::new());
    }
    for _ in 0..12 {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let settled = state
            .online
            .lock()
            .map(|map| map.get(id).map(|entry| entry.pending == 0).unwrap_or(true))
            .unwrap_or(true);
        if settled {
            break;
        }
    }
    Ok(state
        .online
        .lock()
        .map(|map| map.get(id).map(|entry| entry.players.clone()).unwrap_or_default())
        .unwrap_or_default())
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

pub fn get_server_properties(state: &AppState, id: &str) -> AppResult<Vec<config::Property>> {
    let view = instance::get_instance(&state.data_dir, id)?;
    config::read_properties(Path::new(&view.dir))
}

pub fn set_server_properties(state: &AppState, id: &str, values: BTreeMap<String, String>) -> AppResult<()> {
    let view = instance::get_instance(&state.data_dir, id)?;
    config::write_properties(Path::new(&view.dir), &values)
}

pub fn update_server_settings(state: &AppState, id: &str, settings: ServerSettings) -> AppResult<InstanceView> {
    let view = instance::get_instance(&state.data_dir, id)?;
    let dir = PathBuf::from(&view.dir);
    let mut cfg = view.config;
    cfg.memory_min_mb = settings.memory_min_mb;
    cfg.memory_max_mb = settings.memory_max_mb;
    cfg.jvm_args = settings.jvm_args;
    cfg.port = settings.port;
    config::set_port(&dir, settings.port)?;
    instance::update_instance(&state.data_dir, cfg, &dir)
}

// ---------------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------------

fn dir_of(state: &AppState, id: &str) -> AppResult<PathBuf> {
    Ok(PathBuf::from(instance::get_instance(&state.data_dir, id)?.dir))
}

pub fn get_players(state: &AppState, id: &str) -> AppResult<players::PlayersData> {
    Ok(players::read_players(&dir_of(state, id)?))
}

pub fn save_player_list(state: &AppState, id: &str, list: &str, entries: Vec<Value>) -> AppResult<()> {
    let parsed = players::PlayerList::parse(list)?;
    players::write_list(&dir_of(state, id)?, parsed, entries)
}

pub fn remove_player(
    state: &AppState,
    id: &str,
    list: &str,
    id_field: &str,
    value: &str,
) -> AppResult<players::PlayersData> {
    let parsed = players::PlayerList::parse(list)?;
    let dir = dir_of(state, id)?;
    let mut data = players::read_players(&dir);
    let target = match parsed {
        players::PlayerList::Whitelist => &mut data.whitelist,
        players::PlayerList::Ops => &mut data.ops,
        players::PlayerList::BannedPlayers => &mut data.banned_players,
        players::PlayerList::BannedIps => &mut data.banned_ips,
    };
    players::remove_entry(target, id_field, value);
    let entries = match parsed {
        players::PlayerList::Whitelist => data.whitelist.clone(),
        players::PlayerList::Ops => data.ops.clone(),
        players::PlayerList::BannedPlayers => data.banned_players.clone(),
        players::PlayerList::BannedIps => data.banned_ips.clone(),
    };
    players::write_list(&dir, parsed, entries)?;
    Ok(data)
}

pub async fn lookup_player(state: &AppState, name: &str) -> AppResult<players::PlayerIdentity> {
    players::lookup_uuid(&state.http, name).await
}

pub async fn get_player_snapshot(
    state: &AppState,
    id: &str,
    name: Option<String>,
    uuid: Option<String>,
) -> AppResult<Value> {
    let dir = dir_of(state, id)?;
    if let Some(name) = name.as_deref() {
        if let Ok(data) = player_live::query(state, id, name, uuid.as_deref()).await {
            return Ok(data);
        }
    }
    let name = name.clone();
    let uuid = uuid.clone();
    tokio::task::spawn_blocking(move || {
        player_snapshot::read_snapshot(&dir, name.as_deref(), uuid.as_deref())
    })
    .await
    .map_err(|error| AppError::Message(error.to_string()))?
}

// ---------------------------------------------------------------------------
// Contenido
// ---------------------------------------------------------------------------

fn load_instance(state: &AppState, id: &str) -> AppResult<(Instance, PathBuf)> {
    let view = instance::get_instance(&state.data_dir, id)?;
    Ok((view.config, PathBuf::from(view.dir)))
}

pub fn list_content(state: &AppState, id: &str) -> AppResult<Vec<content::ContentFile>> {
    let (instance, dir) = load_instance(state, id)?;
    match content::content_dir(&instance, &dir) {
        Some(content_dir) => content::list_files(&content_dir),
        None => Ok(Vec::new()),
    }
}

pub fn toggle_content(state: &AppState, id: &str, name: &str) -> AppResult<()> {
    let (instance, dir) = load_instance(state, id)?;
    let content_dir = content::content_dir(&instance, &dir)
        .ok_or_else(|| AppError::Message("Sin carpeta de contenido.".into()))?;
    content::toggle_file(&content_dir, name)
}

pub fn delete_content(state: &AppState, id: &str, name: &str) -> AppResult<()> {
    let (instance, dir) = load_instance(state, id)?;
    let content_dir = content::content_dir(&instance, &dir)
        .ok_or_else(|| AppError::Message("Sin carpeta de contenido.".into()))?;
    content::delete_file(&content_dir, name)
}

pub fn add_content_file(state: &AppState, id: &str, path: &str) -> AppResult<String> {
    let (instance, dir) = load_instance(state, id)?;
    let content_dir = content::content_dir(&instance, &dir)
        .ok_or_else(|| AppError::Message("Sin carpeta de contenido.".into()))?;
    content::copy_file_in(&content_dir, Path::new(path))
}

pub async fn search_content(
    state: &AppState,
    id: &str,
    source: &str,
    query: Option<String>,
    category: Option<String>,
    sort: Option<String>,
    page: Option<u32>,
) -> AppResult<content::ContentSearchPage> {
    let (instance, _) = load_instance(state, id)?;
    let source = content::ContentSource::parse(source)?;
    let options = content::SearchOptions {
        query: query.unwrap_or_default(),
        page: page.unwrap_or(0).min(100_000),
        category,
        sort,
    };
    content::search(&state.http, &instance, source, &options).await
}

pub async fn list_content_categories(
    state: &AppState,
    id: &str,
    source: &str,
) -> AppResult<Vec<content::ContentCategory>> {
    let (instance, _) = load_instance(state, id)?;
    let source = content::ContentSource::parse(source)?;
    content::categories(&state.http, &instance, source).await
}

pub fn installed_content_ids(state: &AppState, id: &str) -> AppResult<Vec<String>> {
    let (instance, dir) = load_instance(state, id)?;
    match content::content_dir(&instance, &dir) {
        Some(target) => Ok(content::installed_ids(&dir, &target)),
        None => Ok(Vec::new()),
    }
}

pub async fn install_content(
    state: &AppState,
    id: &str,
    source: &str,
    project_id: &str,
) -> AppResult<Vec<String>> {
    let (instance, dir) = load_instance(state, id)?;
    let source = content::ContentSource::parse(source)?;
    let state_prog = state.clone();
    let id_owned = id.to_string();
    let on_progress = move |downloaded: u64, total: Option<u64>| {
        progress(&state_prog, &id_owned, "content", downloaded, total, Some("Instalando contenido".into()));
    };
    content::install(&state.http, &instance, &dir, source, project_id, on_progress).await
}

pub async fn export_mrpack(state: &AppState, id: &str, path: &str) -> AppResult<mrpack::ExportReport> {
    let (instance, dir) = load_instance(state, id)?;
    mrpack::export(&state.http, instance, dir, PathBuf::from(path)).await
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

pub fn list_backups(state: &AppState, id: &str) -> AppResult<Vec<backup::BackupEntry>> {
    Ok(backup::list_backups(&dir_of(state, id)?))
}

pub async fn create_backup(state: &AppState, id: &str) -> AppResult<String> {
    let view = instance::get_instance(&state.data_dir, id)?;
    let dir = PathBuf::from(&view.dir);
    let retention = view.config.backup_retention.unwrap_or(5);
    let name = backup::create_backup(dir.clone(), retention).await?;
    let mut cfg = view.config;
    cfg.last_backup_at = Some(chrono::Utc::now().to_rfc3339());
    let _ = instance::update_instance(&state.data_dir, cfg, &dir);
    Ok(name)
}

pub fn delete_backup(state: &AppState, id: &str, name: &str) -> AppResult<()> {
    backup::delete_backup(&dir_of(state, id)?, name)
}

pub fn update_schedule(
    state: &AppState,
    id: &str,
    settings: ScheduleSettings,
) -> AppResult<InstanceView> {
    let view = instance::get_instance(&state.data_dir, id)?;
    let dir = PathBuf::from(&view.dir);
    let mut cfg = view.config;
    cfg.backup_interval_minutes = settings.backup_interval_minutes;
    cfg.backup_retention = settings.backup_retention;
    cfg.restart_interval_minutes = settings.restart_interval_minutes;
    instance::update_instance(&state.data_dir, cfg, &dir)
}

// ---------------------------------------------------------------------------
// Red y sistema de archivos (para el panel remoto)
// ---------------------------------------------------------------------------

pub async fn server_connections(state: &AppState, id: &str) -> AppResult<Connections> {
    let instance = instance::get_instance(&state.data_dir, id)?;
    let properties = config::read_properties(Path::new(&instance.dir))?;
    let port = properties
        .iter()
        .find(|p| p.key == "server-port")
        .and_then(|p| p.value.parse().ok())
        .unwrap_or(instance.config.port);
    let bind_ip = properties
        .iter()
        .find(|p| p.key == "server-ip")
        .map(|p| p.value.clone())
        .unwrap_or_default();

    #[cfg(windows)]
    {
        let script = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$rows = @(foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
  if ($adapter.OperationalStatus -ne 'Up' -or $adapter.NetworkInterfaceType -eq 'Loopback') { continue }
  foreach ($address in $adapter.GetIPProperties().UnicastAddresses) {
    if ($address.Address.AddressFamily -eq 'InterNetwork') {
      [pscustomobject]@{ name=$adapter.Name; description=$adapter.Description; ip=$address.Address.ToString() }
    }
  }
})
ConvertTo-Json -InputObject $rows -Compress
"#;
        let mut command = tokio::process::Command::new("powershell.exe");
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .creation_flags(0x0800_0000)
            .kill_on_drop(true);
        let output = tokio::time::timeout(std::time::Duration::from_secs(12), command.output())
            .await
            .map_err(|_| AppError::Message("La detección de redes tardó demasiado. Inténtalo de nuevo.".into()))??;
        if !output.status.success() {
            return Err(AppError::Message("No se pudieron consultar los adaptadores de red.".into()));
        }
        let mut addresses: Vec<Address> = serde_json::from_slice(&output.stdout)?;
        addresses.retain(|a| {
            a.ip.parse::<std::net::Ipv4Addr>()
                .is_ok_and(|ip| !ip.is_loopback() && !ip.is_link_local() && !ip.is_unspecified())
        });
        for address in &mut addresses {
            address.network = network_name(&address.name, &address.description);
        }
        addresses.sort_by_key(|a| (a.network == a.name, a.network.clone(), a.ip.clone()));
        addresses.dedup_by(|a, b| a.ip == b.ip && a.name == b.name);
        Ok(Connections { addresses, port, bind_ip })
    }
    #[cfg(not(windows))]
    {
        let ip = primary_local_ip().unwrap_or_else(|| "127.0.0.1".into());
        Ok(Connections {
            addresses: vec![Address {
                name: "Interfaz principal".into(),
                description: String::new(),
                ip,
                network: String::new(),
            }],
            port,
            bind_ip,
        })
    }
}

fn network_name(name: &str, description: &str) -> String {
    let text = format!("{name} {description}").to_lowercase();
    for (needle, label) in [
        ("zerotier", "ZeroTier"),
        ("tailscale", "Tailscale"),
        ("hamachi", "Hamachi"),
        ("radmin", "Radmin VPN"),
        ("wireguard", "WireGuard"),
        ("openvpn", "OpenVPN"),
    ] {
        if text.contains(needle) {
            return label.into();
        }
    }
    name.into()
}

fn primary_local_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}

/// Explora carpetas del servidor (para elegir la carpeta base de forma remota).
pub fn browse(path: Option<&str>) -> AppResult<Vec<FsEntry>> {
    match path {
        None | Some("") => Ok(roots()),
        Some(dir) => {
            let mut out = Vec::new();
            for entry in std::fs::read_dir(dir)? {
                let entry = entry?;
                let meta = entry.metadata()?;
                let is_dir = meta.is_dir();
                out.push(FsEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir,
                });
            }
            out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            Ok(out)
        }
    }
}

fn roots() -> Vec<FsEntry> {
    #[cfg(windows)]
    {
        let mut out = Vec::new();
        for letter in b'A'..=b'Z' {
            let root = format!("{}:\\", letter as char);
            if Path::new(&root).exists() {
                out.push(FsEntry {
                    name: root.clone(),
                    path: root,
                    is_dir: true,
                });
            }
        }
        out
    }
    #[cfg(not(windows))]
    {
        vec![FsEntry {
            name: "/".into(),
            path: "/".into(),
            is_dir: true,
        }]
    }
}

#[cfg(test)]
mod tests {
    use super::network_name;

    #[test]
    fn recognizes_adapter_descriptions_without_guessing_from_ip() {
        assert_eq!(network_name("Ethernet 3", "ZeroTier One Virtual Port"), "ZeroTier");
        assert_eq!(network_name("TAILSCALE", "Tunnel"), "Tailscale");
        assert_eq!(network_name("Ethernet", "Intel Adapter"), "Ethernet");
        assert_eq!(network_name("VPN", "Hamachi Virtual Ethernet Adapter"), "Hamachi");
    }
}
