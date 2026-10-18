use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};

/// Datos de jugadores leídos de los archivos del servidor.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlayersData {
    pub whitelist: Vec<Value>,
    pub ops: Vec<Value>,
    pub banned_players: Vec<Value>,
    pub banned_ips: Vec<Value>,
}

/// Identidad resuelta de un jugador.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerIdentity {
    pub uuid: String,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayerList {
    Whitelist,
    Ops,
    BannedPlayers,
    BannedIps,
}

impl PlayerList {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "whitelist" => Ok(Self::Whitelist),
            "ops" => Ok(Self::Ops),
            "bans" | "bannedPlayers" | "banned-players" => Ok(Self::BannedPlayers),
            "bannedIps" | "banned-ips" => Ok(Self::BannedIps),
            other => Err(AppError::Message(format!("Lista desconocida: {other}"))),
        }
    }

    fn file_name(self) -> &'static str {
        match self {
            Self::Whitelist => "whitelist.json",
            Self::Ops => "ops.json",
            Self::BannedPlayers => "banned-players.json",
            Self::BannedIps => "banned-ips.json",
        }
    }
}

fn read_array(dir: &Path, list: PlayerList) -> Vec<Value> {
    let path = dir.join(list.file_name());
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<Value>>(&t).ok())
        .unwrap_or_default()
}

fn write_array(dir: &Path, list: PlayerList, entries: &[Value]) -> AppResult<()> {
    crate::paths::ensure_dir(dir)?;
    let raw = serde_json::to_string_pretty(entries)?;
    std::fs::write(dir.join(list.file_name()), raw)?;
    Ok(())
}

pub fn read_players(dir: &Path) -> PlayersData {
    PlayersData {
        whitelist: read_array(dir, PlayerList::Whitelist),
        ops: read_array(dir, PlayerList::Ops),
        banned_players: read_array(dir, PlayerList::BannedPlayers),
        banned_ips: read_array(dir, PlayerList::BannedIps),
    }
}

pub fn write_list(dir: &Path, list: PlayerList, entries: Vec<Value>) -> AppResult<()> {
    write_array(dir, list, &entries)
}

/// Convierte una lista a un vector con el campo `uuid`/`ip` eliminado.
pub fn remove_entry(entries: &mut Vec<Value>, id_field: &str, id: &str) {
    entries.retain(|e| e.get(id_field).and_then(Value::as_str) != Some(id));
}

/// Construye una entrada de whitelist.
#[cfg(test)]
pub fn whitelist_entry(uuid: &str, name: &str) -> Value {
    serde_json::json!({ "uuid": uuid, "name": name })
}

/// Construye una entrada de operadores.
#[cfg(test)]
pub fn op_entry(uuid: &str, name: &str, level: u8) -> Value {
    serde_json::json!({
        "uuid": uuid,
        "name": name,
        "level": level,
        "bypassesPlayerLimit": false
    })
}

/// Consulta el UUID de un jugador a través de la API de Mojang.
pub async fn lookup_uuid(client: &reqwest::Client, name: &str) -> AppResult<PlayerIdentity> {
    #[derive(Deserialize)]
    struct MojangProfile {
        id: String,
        name: String,
    }

    let url = format!("https://api.mojang.com/users/profiles/minecraft/{name}");
    let resp = client.get(&url).send().await?;
    if resp.status() == reqwest::StatusCode::NO_CONTENT
        || resp.status() == reqwest::StatusCode::NOT_FOUND
    {
        return Err(AppError::NotFound(format!("jugador {name}")));
    }
    let resp = resp.error_for_status()?;
    let profile: MojangProfile = resp.json().await?;
    Ok(PlayerIdentity {
        uuid: profile.id,
        name: profile.name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_missing_as_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let data = read_players(tmp.path());
        assert!(data.whitelist.is_empty());
        assert!(data.ops.is_empty());
    }

    #[test]
    fn writes_and_reads_whitelist() {
        let tmp = tempfile::tempdir().unwrap();
        let entries = vec![whitelist_entry("abc", "Steve")];
        write_list(tmp.path(), PlayerList::Whitelist, entries).unwrap();

        let data = read_players(tmp.path());
        assert_eq!(data.whitelist.len(), 1);
        assert_eq!(data.whitelist[0]["name"], "Steve");
    }

    #[test]
    fn remove_by_uuid() {
        let mut entries = vec![whitelist_entry("abc", "Steve"), whitelist_entry("def", "Alex")];
        remove_entry(&mut entries, "uuid", "abc");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["name"], "Alex");
    }
}
