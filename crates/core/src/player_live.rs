//! Bounded SNBT reader and read-only console queries. Does not force world saves.
use serde_json::{json, Value};
use crate::{error::{AppError, AppResult}, state::AppState};
fn invalid() -> AppError { AppError::Message("No se pudieron consultar los datos en vivo.".into()) }
struct Parser { chars: Vec<char>, pos: usize, nodes: usize }
impl Parser {
    fn ws(&mut self) { while self.peek().is_some_and(char::is_whitespace) { self.pos += 1; } }
    fn peek(&self) -> Option<char> { self.chars.get(self.pos).copied() }
    fn expect(&mut self, c: char) -> AppResult<()> { self.ws(); if self.peek() != Some(c) { return Err(invalid()); } self.pos += 1; Ok(()) }
    fn text(&mut self, key: bool) -> AppResult<String> {
        self.ws();
        if matches!(self.peek(), Some('"' | '\'')) {
            let quote = self.peek().unwrap(); self.pos += 1;
            let mut out = String::new();
            while let Some(c) = self.peek() {
                self.pos += 1;
                if c == quote { return Ok(out); }
                if c == '\\' { let next = self.peek().ok_or_else(invalid)?; self.pos += 1; out.push(next); }
                else { out.push(c); }
            }
            return Err(invalid());
        }
        let start = self.pos;
        while self.peek().is_some_and(|c| !c.is_whitespace() && !",]}".contains(c) && !(key && c == ':')) { self.pos += 1; }
        if self.pos == start { return Err(invalid()); }
        Ok(self.chars[start..self.pos].iter().collect())
    }
    fn value(&mut self, depth: usize) -> AppResult<Value> {
        self.nodes += 1; if depth > 64 || self.nodes > 200_000 { return Err(invalid()); }
        self.ws();
        match self.peek() {
            Some('{') => {
                self.pos += 1; self.ws(); let mut obj = serde_json::Map::new();
                while self.peek() != Some('}') {
                    let key = self.text(true)?; self.expect(':')?;
                    obj.insert(key, self.value(depth + 1)?); self.ws();
                    if self.peek() == Some('}') { break; } self.expect(',')?;
                }
                self.expect('}')?; Ok(Value::Object(obj))
            }
            Some('[') => {
                self.pos += 1; self.ws();
                if matches!(self.peek(), Some('B'|'I'|'L')) && self.chars.get(self.pos+1) == Some(&';') { self.pos += 2; }
                self.ws(); let mut items = Vec::new();
                while self.peek() != Some(']') {
                    items.push(self.value(depth+1)?); self.ws();
                    if self.peek() == Some(']') { break; } self.expect(',')?;
                }
                self.expect(']')?; Ok(Value::Array(items))
            }
            Some('"'|'\'') => Ok(json!(self.text(false)?)),
            Some(_) => {
                let text = self.text(false)?;
                if text == "true" { return Ok(json!(1)); }
                if text == "false" { return Ok(json!(0)); }
                let number = text.strip_suffix(['b','B','s','S','l','L','f','F','d','D']).unwrap_or(&text);
                if let Ok(n) = number.parse::<i64>() { return Ok(json!(n)); }
                if let Ok(n) = number.parse::<f64>() { if n.is_finite() { return Ok(json!(n)); } }
                Ok(json!(text))
            }
            None => Err(invalid())
        }
    }
}
fn parse(text: &str) -> AppResult<Value> {
    if text.len() > 16*1024*1024 { return Err(invalid()); }
    let mut parser = Parser { chars: text.chars().collect(), pos: 0, nodes: 0 };
    let value = parser.value(0)?; parser.ws();
    if parser.pos != parser.chars.len() || !value.is_object() { return Err(invalid()); }
    Ok(value)
}
fn response<'a>(line: &'a str, name: &str) -> Option<&'a str> {
    // Require the exact server logger payload, never a chat substring.
    let (_, payload) = line.split_once("]: ")?;
    payload.strip_prefix(&format!("{name} has the following entity data: "))
}
pub async fn query(state: &AppState, id: &str, name: &str, uuid: Option<&str>) -> AppResult<Value> {
    if name.is_empty() || name.len() > 16 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') { return Err(invalid()); }
    if !crate::process::is_running(&state.processes, id).await { return Err(invalid()); }
    let _guard = state.player_query.lock().await;
    let mut logs = state.player_logs.subscribe();
    crate::process::send_command(&state.processes, id, &format!("data get entity {name}")).await?;
    let data = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let (server, line) = logs.recv().await.map_err(|_| invalid())?;
            if server != id { continue; }
            if let Some(text) = response(&line, name) { return parse(text); }
        }
    }).await.map_err(|_| invalid())??;
    let mut result = crate::player_snapshot::project(&data);
    result["uuid"] = json!(uuid.unwrap_or_default());
    result["source"] = json!("live");
    result["savedAt"] = Value::Null;
    result["observedAt"] = json!(chrono::Utc::now().to_rfc3339());
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_entity_snbt_and_modern_equipment() {
        let data = parse(r#"{Health:18.0f, foodLevel:20, Pos:[-3.5d,64.0d,2.0d], UUID:[I;1,2,3,4], Inventory:[{Slot:0b,id:"minecraft:stone",count:64}], equipment:{head:{id:"minecraft:iron_helmet",count:1}}, LastDeathLocation:{pos:[I;-4,60,5],dimension:"minecraft:overworld"}, custom:'it\'s ok'}"#).unwrap();
        let projected = crate::player_snapshot::project(&data);
        assert_eq!(projected["health"],18.0);
        assert_eq!(projected["inventory"][1]["slot"],103);
        assert_eq!(projected["lastDeath"]["pos"],json!([-4,60,5]));
        assert!(parse("{Health:20f").is_err());
        assert!(parse("{} garbage").is_err());
        assert!(response("[12:00:00] [Server thread/INFO]: <Alex> Alex has the following entity data: {}", "Alex").is_none());
        assert!(response("[12:00:00] [Server thread/INFO]: Bob has the following entity data: {}", "Alex").is_none());
        assert_eq!(response("[12:00:00] [Server thread/INFO]: Alex has the following entity data: {}", "Alex"),Some("{}"));
    }
}
