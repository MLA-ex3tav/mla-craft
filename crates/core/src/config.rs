use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;

#[derive(Clone, Copy)]
enum Kind {
    Text,
    Int,
    Bool,
    Enum(&'static [&'static str]),
}

struct Spec {
    key: &'static str,
    default: &'static str,
    kind: Kind,
    label: &'static str,
    desc: &'static str,
}

const DIFFICULTIES: &[&str] = &["peaceful", "easy", "normal", "hard"];
const GAMEMODES: &[&str] = &["survival", "creative", "adventure", "spectator"];

fn specs() -> &'static [Spec] {
    &[
        Spec { key: "motd", default: "Un servidor de Minecraft", kind: Kind::Text, label: "MOTD", desc: "Mensaje mostrado en la lista de servidores." },
        Spec { key: "server-port", default: "25565", kind: Kind::Int, label: "Puerto", desc: "Puerto en el que escucha el servidor." },
        Spec { key: "server-ip", default: "", kind: Kind::Text, label: "IP", desc: "IP a la que enlazar (vacío = todas)." },
        Spec { key: "max-players", default: "20", kind: Kind::Int, label: "Jugadores máx.", desc: "Número máximo de jugadores." },
        Spec { key: "online-mode", default: "true", kind: Kind::Bool, label: "Modo online", desc: "Verifica cuentas con Mojang. Desactívalo solo en redes locales." },
        Spec { key: "white-list", default: "false", kind: Kind::Bool, label: "Whitelist", desc: "Solo permite jugadores en la whitelist." },
        Spec { key: "enforce-whitelist", default: "false", kind: Kind::Bool, label: "Forzar whitelist", desc: "Expulsa a quien no esté en la whitelist." },
        Spec { key: "difficulty", default: "easy", kind: Kind::Enum(DIFFICULTIES), label: "Dificultad", desc: "Dificultad del mundo." },
        Spec { key: "gamemode", default: "survival", kind: Kind::Enum(GAMEMODES), label: "Modo de juego", desc: "Modo de juego por defecto." },
        Spec { key: "hardcore", default: "false", kind: Kind::Bool, label: "Hardcore", desc: "Modo hardcore (muerte permanente)." },
        Spec { key: "pvp", default: "true", kind: Kind::Bool, label: "PvP", desc: "Permite combate entre jugadores." },
        Spec { key: "level-name", default: "world", kind: Kind::Text, label: "Nombre del mundo", desc: "Carpeta del mundo." },
        Spec { key: "level-seed", default: "", kind: Kind::Text, label: "Semilla", desc: "Semilla del mundo (vacío = aleatoria)." },
        Spec { key: "view-distance", default: "10", kind: Kind::Int, label: "Distancia de vista", desc: "Chunks enviados al cliente (3-32)." },
        Spec { key: "simulation-distance", default: "10", kind: Kind::Int, label: "Distancia de simulación", desc: "Chunks simulados (3-32)." },
        Spec { key: "spawn-protection", default: "16", kind: Kind::Int, label: "Protección de spawn", desc: "Radio protegido alrededor del spawn." },
        Spec { key: "allow-flight", default: "false", kind: Kind::Bool, label: "Permitir vuelo", desc: "Permite volar en supervivencia." },
        Spec { key: "allow-nether", default: "true", kind: Kind::Bool, label: "Permitir Nether", desc: "Habilita la dimensión del Nether." },
        Spec { key: "spawn-monsters", default: "true", kind: Kind::Bool, label: "Generar monstruos", desc: "Genera monstruos hostiles." },
        Spec { key: "spawn-animals", default: "true", kind: Kind::Bool, label: "Generar animales", desc: "Genera animales pasivos." },
        Spec { key: "spawn-npcs", default: "true", kind: Kind::Bool, label: "Generar aldeanos", desc: "Genera aldeanos." },
        Spec { key: "generate-structures", default: "true", kind: Kind::Bool, label: "Generar estructuras", desc: "Genera estructuras como aldeas." },
        Spec { key: "enable-command-block", default: "false", kind: Kind::Bool, label: "Bloques de comandos", desc: "Habilita los bloques de comandos." },
        Spec { key: "player-idle-timeout", default: "0", kind: Kind::Int, label: "Timeout inactivo", desc: "Minutos antes de expulsar a inactivos (0 = nunca)." },
        Spec { key: "enable-rcon", default: "false", kind: Kind::Bool, label: "Habilitar RCON", desc: "Activa el protocolo RCON." },
        Spec { key: "rcon.port", default: "25575", kind: Kind::Int, label: "Puerto RCON", desc: "Puerto de RCON." },
        Spec { key: "rcon.password", default: "", kind: Kind::Text, label: "Contraseña RCON", desc: "Contraseña de RCON." },
        Spec { key: "enable-status", default: "true", kind: Kind::Bool, label: "Mostrar estado", desc: "Muestra el servidor en la lista de servidores." },
        Spec { key: "enforce-secure-profile", default: "true", kind: Kind::Bool, label: "Perfil seguro", desc: "Exige firmas de chat de Mojang." },
        Spec { key: "prevent-proxy-connections", default: "false", kind: Kind::Bool, label: "Bloquear proxies", desc: "Rechaza conexiones por proxy." },
        Spec { key: "network-compression-threshold", default: "256", kind: Kind::Int, label: "Umbral de compresión", desc: "Tamaño mínimo para comprimir paquetes." },
        Spec { key: "op-permission-level", default: "4", kind: Kind::Int, label: "Nivel de OP", desc: "Nivel de permisos para operadores." },
        Spec { key: "function-permission-level", default: "2", kind: Kind::Int, label: "Nivel de funciones", desc: "Nivel de permisos para funciones." },
    ]
}

/// Propiedad enviada al frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Property {
    pub key: String,
    pub value: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    pub label: String,
    pub description: String,
}

/// Parsea un archivo `.properties` en pares clave-valor.
pub fn parse_properties(text: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            map.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    map
}

pub fn properties_path(dir: &Path) -> std::path::PathBuf {
    dir.join("server.properties")
}

/// Escribe `server.properties` con el puerto indicado si no existe.
pub fn ensure_properties(dir: &Path, port: u16) -> AppResult<()> {
    let path = properties_path(dir);
    if path.exists() {
        return Ok(());
    }
    let mut values = BTreeMap::new();
    for spec in specs() {
        values.insert(spec.key.to_string(), spec.default.to_string());
    }
    values.insert("server-port".to_string(), port.to_string());
    write_properties(dir, &values)
}

/// Lee las propiedades, mezclando archivo actual con los valores por defecto.
pub fn read_properties(dir: &Path) -> AppResult<Vec<Property>> {
    let path = properties_path(dir);
    let existing = if path.exists() {
        parse_properties(&std::fs::read_to_string(&path)?)
    } else {
        BTreeMap::new()
    };

    let mut out = Vec::new();
    let mut known: Vec<String> = Vec::new();

    for spec in specs() {
        known.push(spec.key.to_string());
        let value = existing
            .get(spec.key)
            .cloned()
            .unwrap_or_else(|| spec.default.to_string());
        let (kind, options) = match spec.kind {
            Kind::Text => ("text", None),
            Kind::Int => ("int", None),
            Kind::Bool => ("bool", None),
            Kind::Enum(opts) => ("enum", Some(opts.iter().map(|s| s.to_string()).collect())),
        };
        out.push(Property {
            key: spec.key.to_string(),
            value,
            kind: kind.to_string(),
            options,
            label: spec.label.to_string(),
            description: spec.desc.to_string(),
        });
    }

    // Claves desconocidas presentes en el archivo.
    for (key, value) in existing {
        if !known.contains(&key) {
            out.push(Property {
                key: key.clone(),
                value,
                kind: "text".to_string(),
                options: None,
                label: key,
                description: "Propiedad personalizada.".to_string(),
            });
        }
    }

    Ok(out)
}

/// Escribe el archivo respetando el orden de las propiedades conocidas.
pub fn write_properties(dir: &Path, values: &BTreeMap<String, String>) -> AppResult<()> {
    crate::paths::ensure_dir(dir)?;
    let mut lines = vec![
        "# Archivo de configuración del servidor".to_string(),
        "# Generado por MLA Server".to_string(),
        String::new(),
    ];

    let mut written: Vec<String> = Vec::new();
    for spec in specs() {
        if let Some(value) = values.get(spec.key) {
            lines.push(format!("{}={}", spec.key, value));
            written.push(spec.key.to_string());
        }
    }
    for (key, value) in values {
        if !written.contains(key) {
            lines.push(format!("{key}={value}"));
        }
    }

    std::fs::write(properties_path(dir), lines.join("\n") + "\n")?;
    Ok(())
}

/// Actualiza el puerto dentro de `server.properties`.
pub fn set_port(dir: &Path, port: u16) -> AppResult<()> {
    let mut values = if properties_path(dir).exists() {
        parse_properties(&std::fs::read_to_string(properties_path(dir))?)
    } else {
        BTreeMap::new()
    };
    values.insert("server-port".to_string(), port.to_string());
    write_properties(dir, &values)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_properties() {
        let text = "# comment\nmotd=Hola mundo\nserver-port=25565\n\n# otra\nempty=\n";
        let map = parse_properties(text);
        assert_eq!(map.get("motd").unwrap(), "Hola mundo");
        assert_eq!(map.get("server-port").unwrap(), "25565");
        assert_eq!(map.get("empty").unwrap(), "");
    }

    #[test]
    fn roundtrip_keeps_values() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        ensure_properties(dir, 25570).unwrap();
        let props = read_properties(dir).unwrap();
        let port = props.iter().find(|p| p.key == "server-port").unwrap();
        assert_eq!(port.value, "25570");

        let motd = props.iter().find(|p| p.key == "motd").unwrap();
        assert!(!motd.value.is_empty());
    }

    #[test]
    fn write_and_read_custom_key() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        std::fs::write(
            dir.join("server.properties"),
            "motd=Hola\ncustom-key=abc\nserver-port=25565\n",
        )
        .unwrap();
        let props = read_properties(dir).unwrap();
        assert!(props.iter().any(|p| p.key == "custom-key" && p.value == "abc"));

        let mut values = BTreeMap::new();
        for p in &props {
            values.insert(p.key.clone(), p.value.clone());
        }
        values.insert("motd".into(), "Adiós".into());
        write_properties(dir, &values).unwrap();

        let reloaded = read_properties(dir).unwrap();
        assert_eq!(
            reloaded.iter().find(|p| p.key == "motd").unwrap().value,
            "Adiós"
        );
        assert!(reloaded.iter().any(|p| p.key == "custom-key"));
    }
}
