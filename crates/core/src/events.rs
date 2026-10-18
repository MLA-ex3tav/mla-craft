use serde::Serialize;

/// Nombre del evento de log de consola.
pub const LOG_EVENT: &str = "server-log";
/// Nombre del evento de cambio de estado.
pub const STATE_EVENT: &str = "server-state";
/// Nombre del evento de progreso de tareas.
pub const PROGRESS_EVENT: &str = "task-progress";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerState {
    Starting,
    Running,
    Stopping,
    Stopped,
    Crashed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub id: String,
    pub line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateChange {
    pub id: String,
    pub state: ServerState,
}

/// Progreso de una tarea larga (descarga/instalación).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    pub id: String,
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percent: f64,
    pub message: Option<String>,
}

/// Canal de eventos que cada host (Tauri/Web) implementa.
pub trait EventBus: Send + Sync + 'static {
    fn log(&self, id: &str, line: &str);
    fn state(&self, id: &str, state: ServerState);
    fn progress(&self, progress: &TaskProgress);
}

pub fn percent(downloaded: u64, total: Option<u64>) -> f64 {
    match total {
        Some(total) if total > 0 => (downloaded as f64 / total as f64) * 100.0,
        _ => 0.0,
    }
}

/// Construye un progreso de fase sin transferencia numérica.
pub fn phase(id: &str, phase: &str, message: impl Into<String>) -> TaskProgress {
    TaskProgress {
        id: id.to_string(),
        phase: phase.to_string(),
        downloaded: 0,
        total: None,
        percent: 0.0,
        message: Some(message.into()),
    }
}
