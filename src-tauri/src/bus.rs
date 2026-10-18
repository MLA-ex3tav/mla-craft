use mla_craft_core::events::{
    EventBus, LogLine, ServerState, StateChange, TaskProgress, LOG_EVENT, PROGRESS_EVENT,
    STATE_EVENT,
};
use tauri::{AppHandle, Emitter};

/// Implementación del bus de eventos que reenvía a la ventana de Tauri.
pub struct TauriBus {
    app: AppHandle,
}

impl TauriBus {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventBus for TauriBus {
    fn log(&self, id: &str, line: &str) {
        let _ = self.app.emit(
            LOG_EVENT,
            LogLine {
                id: id.to_string(),
                line: line.to_string(),
            },
        );
    }

    fn state(&self, id: &str, state: ServerState) {
        let _ = self.app.emit(
            STATE_EVENT,
            StateChange {
                id: id.to_string(),
                state,
            },
        );
    }

    fn progress(&self, progress: &TaskProgress) {
        let _ = self.app.emit(PROGRESS_EVENT, progress.clone());
    }
}
