//! Read-only, bounded decoding of Java Edition playerdata. Never forces a save.
use std::{io::Read, path::{Component, Path}};
use serde_json::{Value, json};
use crate::error::{AppError, AppResult};

const LIMIT: usize = 16 * 1024 * 1024;
fn invalid() -> AppError { AppError::Message("Datos NBT incompletos, dañados o demasiado grandes. Vuelve a actualizar tras el próximo guardado.".into()) }
struct Nbt<'a> { bytes: &'a [u8], offset: usize, nodes: usize }
impl<'a> Nbt<'a> {
    fn take(&mut self, n: usize) -> AppResult<&'a [u8]> {
        let end = self.offset.checked_add(n).ok_or_else(invalid)?;
        let value = self.bytes.get(self.offset..end).ok_or_else(invalid)?;
        self.offset = end;
        Ok(value)
    }
    fn byte(&mut self) -> AppResult<u8> { Ok(self.take(1)?[0]) }
    fn text(&mut self) -> AppResult<String> {
        let len = u16::from_be_bytes(self.take(2)?.try_into().unwrap()) as usize;
        Ok(String::from_utf8_lossy(self.take(len)?).into_owned())
    }
    fn length(&mut self) -> AppResult<usize> {
        let n = i32::from_be_bytes(self.take(4)?.try_into().unwrap());
        if !(0..=200_000).contains(&n) { return Err(invalid()); }
        Ok(n as usize)
    }
    fn value(&mut self, kind: u8, depth: usize) -> AppResult<Value> {
        self.nodes += 1;
        if depth > 64 || self.nodes > 200_000 { return Err(invalid()); }
        Ok(match kind {
            1 => json!(self.byte()? as i8),
            2 => json!(i16::from_be_bytes(self.take(2)?.try_into().unwrap())),
            3 => json!(i32::from_be_bytes(self.take(4)?.try_into().unwrap())),
            4 => json!(i64::from_be_bytes(self.take(8)?.try_into().unwrap())),
            5 => json!(f32::from_be_bytes(self.take(4)?.try_into().unwrap())),
            6 => json!(f64::from_be_bytes(self.take(8)?.try_into().unwrap())),
            8 => json!(self.text()?),
            7 | 9 | 11 | 12 => {
                let inner = match kind { 7 => 1, 11 => 3, 12 => 4, _ => self.byte()? };
                let len = self.length()?;
                if len > 0 && !(1..=12).contains(&inner) { return Err(invalid()); }
                let mut list = Vec::with_capacity(len.min(4096));
                for _ in 0..len { list.push(self.value(inner, depth + 1)?); }
                Value::Array(list)
            }
            10 => {
                let mut object = serde_json::Map::new();
                loop {
                    let tag = self.byte()?;
                    if tag == 0 { break; }
                    let name = self.text()?;
                    object.insert(name, self.value(tag, depth + 1)?);
                }
                Value::Object(object)
            }
            _ => return Err(invalid()),
        })
    }
}
fn decode(bytes: &[u8]) -> AppResult<Value> {
    let mut data = Vec::new();
    if bytes.starts_with(&[0x1f, 0x8b]) {
        flate2::read::GzDecoder::new(bytes).take((LIMIT + 1) as u64).read_to_end(&mut data)?;
    } else { data.extend_from_slice(bytes); }
    if data.len() > LIMIT { return Err(invalid()); }
    let mut nbt = Nbt { bytes: &data, offset: 0, nodes: 0 };
    if nbt.byte()? != 10 { return Err(invalid()); }
    nbt.text()?;
    nbt.value(10, 0)
}

fn read_bounded(path: &Path) -> AppResult<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?.take((LIMIT + 1) as u64).read_to_end(&mut bytes)?;
    if bytes.len() > LIMIT { return Err(invalid()); }
    Ok(bytes)
}
fn within(root: &Path, file: &Path) -> AppResult<std::path::PathBuf> {
    let real = file.canonicalize()?;
    if !real.starts_with(root) { return Err(AppError::Message("Los datos del jugador están fuera de la carpeta del servidor.".into())); }
    Ok(real)
}
fn inventory(root: &Value, key: &str) -> Value {
    let Some(items) = root[key].as_array() else { return Value::Null; };
    Value::Array(items.iter().filter_map(|item| {
        let id = item["id"].as_str()?;
        Some(json!({"id":id, "slot":item["Slot"].as_i64().or_else(|| item["slot"].as_i64()),
            "count":item["count"].as_i64().or_else(|| item["Count"].as_i64()).unwrap_or(1)}))
    }).collect())
}
fn coordinates(value: &Value) -> Value {
    match value.as_array() {
        Some(values) if values.len() == 3 && values.iter().all(|n| n.as_f64().is_some_and(f64::is_finite)) => value.clone(),
        _ => Value::Null,
    }
}
fn dimension(value: &Value) -> Value {
    if value.is_string() || value.is_i64() { value.clone() } else { Value::Null }
}
pub(crate) fn project(data: &Value) -> Value {
    let death_pos = coordinates(&data["LastDeathLocation"]["pos"]);
    let death = if death_pos.is_null() { Value::Null } else {
        json!({"pos":death_pos,"dimension":dimension(&data["LastDeathLocation"]["dimension"])})
    };
    let mut items = inventory(data, "Inventory");
    if let Some(items) = items.as_array_mut() {
        for (key, slot) in [("head",103),("chest",102),("legs",101),("feet",100),("offhand",-106)] {
            let item = &data["equipment"][key];
            if let Some(id) = item["id"].as_str() {
                items.retain(|entry| entry["slot"] != slot);
                items.push(json!({"id":id,"slot":slot,"count":item["count"].as_i64().unwrap_or(1)}));
            }
        }
    }
    json!({
        "health": data["Health"].as_f64(), "food": data["foodLevel"].as_i64(), "xpLevel": data["XpLevel"].as_i64(),
        "xpProgress": data["XpP"].as_f64(), "position": coordinates(&data["Pos"]), "dimension": dimension(&data["Dimension"]),
        "gameMode": data["playerGameType"].as_i64(), "lastDeath": death,
        "inventory": items, "enderChest": inventory(data, "EnderItems"),
        "dataVersion": data["DataVersion"].as_i64()
    })
}

pub fn read_snapshot(dir: &Path, name: Option<&str>, uuid: Option<&str>) -> AppResult<Value> {
    let root = dir.canonicalize()?;
    // Prefer server-local identities (including offline-mode UUIDs). No network lookup.
    let mut identities = Vec::new();
    if let Some(uuid) = uuid { identities.push(uuid.to_string()); }
    if let Some(name) = name {
        for file in ["usercache.json", "ops.json", "whitelist.json", "banned-players.json"] {
            let path = root.join(file);
            if !path.exists() { continue; }
            let entries: Value = serde_json::from_slice(&read_bounded(&within(&root, &path)?)?)?;
            if let Some(entries) = entries.as_array() {
                for entry in entries {
                    if entry["name"].as_str().is_some_and(|n| n.eq_ignore_ascii_case(name)) {
                        if let Some(uuid) = entry["uuid"].as_str() { identities.push(uuid.to_string()); }
                    }
                }
            }
        }
    }
    let properties_path = root.join("server.properties");
    let properties = if properties_path.exists() { crate::config::parse_properties(&String::from_utf8_lossy(&read_bounded(&within(&root, &properties_path)?)?)) } else { Default::default() };
    let world = properties.get("level-name").map(String::as_str).unwrap_or("world");
    if world.is_empty() || Path::new(world).components().any(|part| !matches!(part, Component::Normal(_))) {
        return Err(AppError::Message("Nombre de mundo no válido para leer playerdata.".into()));
    }
    for identity in identities {
        let Ok(uuid) = uuid::Uuid::parse_str(&identity) else { continue; };
        let file = ["players/data", "playerdata"].iter()
            .map(|layout| root.join(world).join(layout).join(format!("{uuid}.dat")))
            .find(|path| path.exists());
        let Some(file) = file else { continue; };
        if !file.exists() { continue; }
        let file = within(&root, &file)?;
        let metadata = std::fs::metadata(&file)?;
        let data = decode(&read_bounded(&file)?)?;
        let mut result = project(&data);
        result["uuid"] = json!(uuid.to_string());
        result["savedAt"] = json!(metadata.modified().ok().map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339()));
        result["source"] = json!("saved");
        return Ok(result);
    }
    Err(AppError::Message("No hay datos guardados de este jugador en este mundo. Debe haber entrado y Minecraft debe haber guardado su partida; con save-off pueden no existir datos recientes.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tag(kind: u8, name: &str, payload: &[u8], out: &mut Vec<u8>) {
        out.push(kind); out.extend((name.len() as u16).to_be_bytes()); out.extend(name.as_bytes()); out.extend(payload);
    }
    fn fixture() -> Vec<u8> {
        let mut out = vec![10,0,0];
        tag(5, "Health", &17.0f32.to_be_bytes(), &mut out);
        tag(3, "foodLevel", &18i32.to_be_bytes(), &mut out);
        tag(9, "Inventory", &[10,0,0,0,0], &mut out);
        let mut death = Vec::new();
        let mut position = 3i32.to_be_bytes().to_vec();
        for coordinate in [-20i32, 64, 180] { position.extend(coordinate.to_be_bytes()); }
        tag(11, "pos", &position, &mut death); death.push(0);
        tag(10, "LastDeathLocation", &death, &mut out); out.push(0); out
    }
    #[test]
    fn decodes_compressed_snapshot_and_rejects_truncation() {
        use std::io::Write;
        let raw = fixture();
        let mut zip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        zip.write_all(&raw).unwrap();
        let value = project(&decode(&zip.finish().unwrap()).unwrap());
        assert_eq!(value["health"], 17.0);
        assert_eq!(value["lastDeath"]["pos"], json!([-20,64,180]));
        assert_eq!(value["inventory"], json!([]));
        assert!(value["enderChest"].is_null());
        assert!(decode(&raw[..raw.len()-2]).is_err());
        assert!(decode(&[10,0,0,9,0,1,b'x',10,127,255,255,255]).is_err());
    }
    #[test]
    fn supports_old_and_component_era_items() {
        let data = json!({"Inventory":[{"id":"minecraft:stone","Slot":0,"Count":64},{"id":"mod:wand","Slot":-106,"count":1}]});
        let value = inventory(&data, "Inventory");
        assert_eq!(value[0]["count"],64); assert_eq!(value[1]["slot"],-106);
    }
    #[test]
    fn resolves_local_name_and_custom_world_and_blocks_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let id = "12345678-1234-1234-1234-123456789abc";
        std::fs::create_dir_all(dir.path().join("custom/playerdata")).unwrap();
        std::fs::write(dir.path().join("custom/playerdata").join(format!("{id}.dat")), fixture()).unwrap();
        std::fs::write(dir.path().join("usercache.json"), json!([{"name":"Alex","uuid":id}]).to_string()).unwrap();
        std::fs::write(dir.path().join("server.properties"), "level-name=custom\n").unwrap();
        assert_eq!(read_snapshot(dir.path(), Some("aLeX"), None).unwrap()["uuid"], id);
        std::fs::create_dir_all(dir.path().join("custom/players/data")).unwrap();
        let modern_id = "12345678-1234-1234-1234-123456789abd";
        std::fs::write(dir.path().join("custom/players/data").join(format!("{modern_id}.dat")), fixture()).unwrap();
        assert_eq!(read_snapshot(dir.path(), None, Some(modern_id)).unwrap()["health"], 17.0);
        assert!(read_snapshot(dir.path(), None, Some("../../elsewhere")).is_err());
        std::fs::write(dir.path().join("server.properties"), "level-name=../outside\n").unwrap();
        assert!(read_snapshot(dir.path(), Some("Alex"), None).is_err());
    }
}
