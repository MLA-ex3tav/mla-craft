//! Lógica de MLA Server independiente de la interfaz (Tauri/GUI o headless).

pub mod api;
pub mod backup;
pub mod config;
pub mod content;
pub mod download;
pub mod error;
pub mod events;
pub mod instance;
pub mod java;
pub mod mcsr;
pub mod mrpack;
pub mod paths;
pub mod player_live;
pub mod player_snapshot;
pub mod players;
pub mod process;
pub mod providers;
pub mod scheduler;
pub mod state;

pub use error::{AppError, AppResult};
pub use state::AppState;
