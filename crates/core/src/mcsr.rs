//! Opt-in reset loop. The Node wrapper owns Java and is the process tracked by the app.
use std::path::Path;
use crate::error::{AppError, AppResult};
use crate::instance::Instance;

const WRAPPER: &str = include_str!("../mcsr/server.js");

fn regular_or_absent(path: &Path) -> AppResult<()> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if !meta.file_type().is_file() => Err(AppError::Message(format!("MCSR requiere un archivo normal: {}", path.display()))),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

/// Prepares managed files without deleting any world or accepting the EULA.
pub fn prepare(instance: &Instance, dir: &Path, java: &str, args: &[String]) -> AppResult<()> {
    if instance.server_type.is_plugin() {
        return Err(AppError::Message("MCSR Co-op admite Vanilla, Fabric, Forge y NeoForge; no servidores con mundos separados de plugins.".into()));
    }
    for name in ["server.js", "mcsr-launch.json", "server.properties"] {
        regular_or_absent(&dir.join(name))?;
    }
    let wrapper = dir.join("server.js");
    if wrapper.exists() && !std::fs::read_to_string(&wrapper)?.starts_with("// MLA Craft MCSR Co-op wrapper v1") {
        return Err(AppError::Message("Ya existe un server.js ajeno a MLA Craft. No se sobrescribió.".into()));
    }
    let properties = dir.join("server.properties");
    let mut values = if properties.exists() {
        crate::config::parse_properties(&std::fs::read_to_string(&properties)?)
    } else { Default::default() };
    for (key, value) in [("spawn-protection", "0"), ("allow-flight", "true"), ("level-name", "world")] {
        values.insert(key.into(), value.into());
    }
    crate::config::write_properties(dir, &values)?;
    std::fs::write(wrapper, WRAPPER)?;
    std::fs::write(dir.join("mcsr-launch.json"), serde_json::to_vec_pretty(&serde_json::json!({ "java": java, "args": args }))?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prepares_properties_and_preserves_world_and_other_settings() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("world")).unwrap();
        std::fs::write(dir.path().join("world/level.dat"), "keep").unwrap();
        std::fs::write(dir.path().join("server.properties"), "spawn-protection=16\nallow-flight=false\nlevel-name=old\nserver-port=25566\n").unwrap();
        let instance = serde_json::from_value(serde_json::json!({"id":"test","name":"test","type":"fabric","mcVersion":"1.16.1","createdAt":"now"})).unwrap();
        prepare(&instance, dir.path(), "java", &["-jar".into(), "server.jar".into()]).unwrap();
        let values = crate::config::parse_properties(&std::fs::read_to_string(dir.path().join("server.properties")).unwrap());
        assert_eq!(values["spawn-protection"], "0");
        assert_eq!(values["allow-flight"], "true");
        assert_eq!(values["level-name"], "world");
        assert_eq!(values["server-port"], "25566");
        assert!(dir.path().join("world/level.dat").exists());
        std::fs::write(dir.path().join("server.js"), "user script").unwrap();
        assert!(prepare(&instance, dir.path(), "java", &[]).is_err());
    }
}
