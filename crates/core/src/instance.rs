use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const INSTANCE_FILE: &str = "instance.json";
pub const REGISTRY_FILE: &str = "instances.json";

/// Tipo de servidor soportado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerType {
    Vanilla,
    Paper,
    #[serde(alias = "purpur")]
    Spigot,
    Fabric,
    NeoForge,
    Forge,
}

impl ServerType {
    /// Servidores que se ejecutan con mods (carpeta `mods/`).
    pub fn is_modded(self) -> bool {
        matches!(self, ServerType::Fabric | ServerType::NeoForge | ServerType::Forge)
    }

    /// Servidores que se ejecutan con plugins (carpeta `plugins/`).
    pub fn is_plugin(self) -> bool {
        matches!(self, ServerType::Paper | ServerType::Spigot)
    }
}

fn default_min_mem() -> u32 {
    1024
}

fn default_max_mem() -> u32 {
    4096
}

fn default_port() -> u16 {
    25565
}

/// Configuración persistida de una instancia de servidor.
///
/// Se guarda en `instance.json` dentro de la carpeta del servidor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub server_type: ServerType,
    pub mc_version: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub build: Option<u32>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub java_major: Option<u32>,
    #[serde(default = "default_min_mem")]
    pub memory_min_mb: u32,
    #[serde(default = "default_max_mem")]
    pub memory_max_mb: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub mcsr_coop: bool,
    pub created_at: String,
    #[serde(default)]
    pub last_started: Option<String>,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub backup_interval_minutes: Option<u32>,
    #[serde(default)]
    pub backup_retention: Option<u32>,
    #[serde(default)]
    pub restart_interval_minutes: Option<u32>,
    #[serde(default)]
    pub last_backup_at: Option<String>,
    #[serde(default)]
    pub last_restart_at: Option<String>,
}

impl Instance {
    pub fn load(dir: &Path) -> AppResult<Self> {
        let path = dir.join(INSTANCE_FILE);
        let raw = std::fs::read_to_string(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::NotFound(format!("instance.json en {}", dir.display()))
            } else {
                AppError::Io(e)
            }
        })?;
        Ok(serde_json::from_str(&raw)?)
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        crate::paths::ensure_dir(dir)?;
        let path = dir.join(INSTANCE_FILE);
        let raw = serde_json::to_string_pretty(self)?;
        std::fs::write(path, raw)?;
        Ok(())
    }
}

/// Datos recibidos al crear una instancia desde el asistente.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewInstanceRequest {
    pub dir: String,
    pub name: String,
    #[serde(rename = "type")]
    pub server_type: ServerType,
    pub mc_version: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub build: Option<u32>,
    #[serde(default = "default_min_mem")]
    pub memory_min_mb: u32,
    #[serde(default = "default_max_mem")]
    pub memory_max_mb: u32,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub mcsr_coop: bool,
}

/// Instancia + su carpeta, tal como se envía al frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceView {
    #[serde(flatten)]
    pub config: Instance,
    pub dir: String,
}

/// Entrada del registro global de instancias.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub id: String,
    pub path: String,
}

/// Registro global (lista de instancias conocidas).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Registry {
    #[serde(default)]
    pub instances: Vec<RegistryEntry>,
}

impl Registry {
    pub fn path_of(&self, id: &str) -> Option<PathBuf> {
        self.instances
            .iter()
            .find(|e| e.id == id)
            .map(|e| PathBuf::from(&e.path))
    }

    pub fn add(&mut self, id: String, path: PathBuf) {
        let path = path.to_string_lossy().to_string();
        if let Some(existing) = self.instances.iter_mut().find(|e| e.id == id) {
            existing.path = path;
        } else {
            self.instances.push(RegistryEntry { id, path });
        }
    }

    pub fn remove(&mut self, id: &str) {
        self.instances.retain(|e| e.id != id);
    }
}

fn registry_path(data_dir: &Path) -> PathBuf {
    data_dir.join(REGISTRY_FILE)
}

pub fn load_registry(data_dir: &Path) -> AppResult<Registry> {
    let path = registry_path(data_dir);
    if !path.exists() {
        return Ok(Registry::default());
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_registry(data_dir: &Path, registry: &Registry) -> AppResult<()> {
    crate::paths::ensure_dir(data_dir)?;
    let raw = serde_json::to_string_pretty(registry)?;
    std::fs::write(registry_path(data_dir), raw)?;
    Ok(())
}

/// Lista todas las instancias válidas y limpia del registro las que ya no existen.
pub fn list_instances(data_dir: &Path) -> AppResult<Vec<InstanceView>> {
    let mut registry = load_registry(data_dir)?;
    let mut views = Vec::new();
    let mut removed = false;

    for entry in registry.instances.clone() {
        let dir = PathBuf::from(&entry.path);
        match Instance::load(&dir) {
            Ok(mut instance) => {
                // El id del archivo manda sobre el del registro.
                instance.id = entry.id.clone();
                views.push(InstanceView {
                    config: instance,
                    dir: entry.path.clone(),
                });
            }
            Err(_) => {
                registry.remove(&entry.id);
                removed = true;
            }
        }
    }

    if removed {
        save_registry(data_dir, &registry)?;
    }

    Ok(views)
}

/// Crea una instancia nueva: escribe `instance.json` y la registra.
pub fn create_instance(data_dir: &Path, req: NewInstanceRequest) -> AppResult<InstanceView> {
    if req.mcsr_coop && req.server_type.is_plugin() {
        return Err(AppError::Message("MCSR Co-op no admite Paper/Spigot: sus dimensiones se guardan en carpetas separadas.".into()));
    }
    let dir = PathBuf::from(&req.dir);

    if dir.join(INSTANCE_FILE).exists() {
        return Err(AppError::Message(format!(
            "La carpeta {} ya contiene un servidor (instance.json).",
            req.dir
        )));
    }

    if req.mcsr_coop && dir.join("world").exists() {
        return Err(AppError::Message("Crea MCSR Co-op en una carpeta sin world: este modo elimina el mapa en cada reset.".into()));
    }
    crate::paths::ensure_dir(&dir)?;

    let instance = Instance {
        id: uuid::Uuid::new_v4().to_string(),
        name: req.name,
        server_type: req.server_type,
        mc_version: req.mc_version,
        loader_version: req.loader_version,
        build: req.build,
        java_path: None,
        java_major: None,
        memory_min_mb: req.memory_min_mb,
        memory_max_mb: req.memory_max_mb,
        jvm_args: Vec::new(),
        port: req.port,
        mcsr_coop: req.mcsr_coop,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_started: None,
        installed: false,
        backup_interval_minutes: None,
        backup_retention: Some(5),
        restart_interval_minutes: None,
        last_backup_at: None,
        last_restart_at: None,
    };

    instance.save(&dir)?;

    let mut registry = load_registry(data_dir)?;
    registry.add(instance.id.clone(), dir.clone());
    save_registry(data_dir, &registry)?;

    Ok(InstanceView {
        config: instance,
        dir: req.dir,
    })
}

/// Guarda cambios en una instancia existente.
pub fn update_instance(data_dir: &Path, mut instance: Instance, dir: &Path) -> AppResult<InstanceView> {
    let existing = Instance::load(dir)?;
    instance.id = existing.id;
    instance.created_at = existing.created_at;
    instance.save(dir)?;

    let mut registry = load_registry(data_dir)?;
    registry.add(instance.id.clone(), dir.to_path_buf());
    save_registry(data_dir, &registry)?;

    Ok(InstanceView {
        config: instance,
        dir: dir.to_string_lossy().to_string(),
    })
}

/// Devuelve una instancia por id.
pub fn get_instance(data_dir: &Path, id: &str) -> AppResult<InstanceView> {
    let registry = load_registry(data_dir)?;
    let dir = registry
        .path_of(id)
        .ok_or_else(|| AppError::NotFound(format!("instancia {id}")))?;
    let config = Instance::load(&dir)?;
    Ok(InstanceView {
        config,
        dir: dir.to_string_lossy().to_string(),
    })
}

/// Elimina una instancia del registro y, opcionalmente, sus archivos.
pub fn delete_instance(data_dir: &Path, id: &str, delete_files: bool) -> AppResult<()> {
    let mut registry = load_registry(data_dir)?;
    let dir = registry.path_of(id);
    registry.remove(id);
    save_registry(data_dir, &registry)?;

    if delete_files {
        if let Some(dir) = dir {
            if dir.exists() {
                std::fs::remove_dir_all(&dir)?;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(dir: &str) -> NewInstanceRequest {
        NewInstanceRequest {
            dir: dir.to_string(),
            name: "Test".into(),
            server_type: ServerType::Paper,
            mc_version: "1.21.8".into(),
            loader_version: None,
            build: Some(48),
            memory_min_mb: 1024,
            memory_max_mb: 4096,
            port: 25565,
            mcsr_coop: false,
        }
    }

    #[test]
    fn create_and_list_instance() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let server = tmp.path().join("server");

        let view = create_instance(&data, sample(&server.to_string_lossy())).unwrap();
        assert!(!view.config.installed);
        assert!(server.join(INSTANCE_FILE).exists());

        let list = list_instances(&data).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].config.mc_version, "1.21.8");
        assert_eq!(list[0].config.server_type, ServerType::Paper);
    }

    #[test]
    fn create_fails_on_existing() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let server = tmp.path().join("server");

        create_instance(&data, sample(&server.to_string_lossy())).unwrap();
        let err = create_instance(&data, sample(&server.to_string_lossy()));
        assert!(err.is_err());
    }

    #[test]
    fn stale_registry_entries_are_pruned() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let server = tmp.path().join("server");

        create_instance(&data, sample(&server.to_string_lossy())).unwrap();
        std::fs::remove_dir_all(&server).unwrap();

        let list = list_instances(&data).unwrap();
        assert!(list.is_empty());
        assert!(load_registry(&data).unwrap().instances.is_empty());
    }

    #[test]
    fn delete_instance_removes_files() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let server = tmp.path().join("server");

        let view = create_instance(&data, sample(&server.to_string_lossy())).unwrap();
        delete_instance(&data, &view.config.id, true).unwrap();
        assert!(!server.exists());
        assert!(list_instances(&data).unwrap().is_empty());
    }

    #[test]
    fn update_preserves_identity() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let server = tmp.path().join("server");

        let mut view = create_instance(&data, sample(&server.to_string_lossy())).unwrap();
        let original_id = view.config.id.clone();
        let original_created = view.config.created_at.clone();

        view.config.name = "Renombrado".into();
        view.config.installed = true;
        let updated = update_instance(&data, view.config, &server).unwrap();

        assert_eq!(updated.config.id, original_id);
        assert_eq!(updated.config.created_at, original_created);
        assert_eq!(updated.config.name, "Renombrado");
        assert!(updated.config.installed);
    }
}
