use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::events::EventBus;
use crate::process::{OnlineMap, ProcessMap};

/// Estado global compartido de la aplicación (independiente del host).
#[derive(Clone)]
pub struct AppState {
    pub player_logs: tokio::sync::broadcast::Sender<(String, String)>,
    pub player_query: Arc<tokio::sync::Mutex<()>>,
    pub data_dir: PathBuf,
    pub http: reqwest::Client,
    pub processes: ProcessMap,
    /// Jugadores en línea por instancia (detectados desde la consola).
    pub online: Arc<Mutex<HashMap<String, OnlineMap>>>,
    /// Canal de eventos del host activo (Tauri o Web).
    pub bus: Arc<dyn EventBus>,
}

impl AppState {
    pub fn new(data_dir: PathBuf, bus: Arc<dyn EventBus>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent("MLA-Craft/0.1.0")
            .build()
            .expect("no se pudo crear el cliente HTTP");
        Self {
            player_logs: tokio::sync::broadcast::channel(32).0,
            player_query: Arc::new(tokio::sync::Mutex::new(())),
            data_dir,
            http,
            processes: crate::process::new_process_map(),
            online: Arc::new(Mutex::new(HashMap::new())),
            bus,
        }
    }
}
