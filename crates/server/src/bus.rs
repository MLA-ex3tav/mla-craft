use mla_craft_core::events::{
    EventBus, ServerState, TaskProgress, LOG_EVENT, PROGRESS_EVENT, STATE_EVENT,
};
use serde_json::json;
use tokio::sync::broadcast;

/// Implementación del bus de eventos que difunde por WebSocket.
#[derive(Clone)]
pub struct WebBus {
    tx: broadcast::Sender<String>,
}

impl WebBus {
    pub fn new(tx: broadcast::Sender<String>) -> Self {
        Self { tx }
    }

    fn send(&self, event: &str, payload: serde_json::Value) {
        let message = json!({ "event": event, "payload": payload }).to_string();
        let _ = self.tx.send(message);
    }
}

impl EventBus for WebBus {
    fn log(&self, id: &str, line: &str) {
        self.send(LOG_EVENT, json!({ "id": id, "line": line }));
    }

    fn state(&self, id: &str, state: ServerState) {
        self.send(STATE_EVENT, json!({ "id": id, "state": state }));
    }

    fn progress(&self, progress: &TaskProgress) {
        self.send(PROGRESS_EVENT, serde_json::to_value(progress).unwrap_or(json!(null)));
    }
}
