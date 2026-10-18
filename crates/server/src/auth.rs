use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

use mla_craft_core::error::{AppError, AppResult};

pub const CONFIG_FILE: &str = "mla-server.json";

/// Configuración persistente del panel headless.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub username: String,
    pub password_hash: String,
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
}

fn default_host() -> String {
    "0.0.0.0".to_string()
}

fn default_port() -> u16 {
    8722
}

impl ServerConfig {
    pub fn load(dir: &Path) -> Option<ServerConfig> {
        let path = dir.join(CONFIG_FILE);
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        std::fs::create_dir_all(dir)?;
        std::fs::write(dir.join(CONFIG_FILE), serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| AppError::Message(format!("No se pudo proteger la contraseña: {e}")))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

/// Sesiones activas (token -> usuario).
#[derive(Default)]
pub struct Sessions {
    inner: Mutex<HashSet<String>>,
}

impl Sessions {
    pub fn start(&self) -> String {
        let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
        if let Ok(mut set) = self.inner.lock() {
            set.insert(token.clone());
        }
        token
    }

    pub fn is_valid(&self, token: &str) -> bool {
        self.inner
            .lock()
            .map(|set| set.contains(token))
            .unwrap_or(false)
    }

    pub fn revoke(&self, token: &str) {
        if let Ok(mut set) = self.inner.lock() {
            set.remove(token);
        }
    }
}

/// Control de intentos de inicio de sesión (rate-limit simple).
#[derive(Default)]
pub struct Throttle {
    state: Mutex<(u32, Option<std::time::Instant>)>,
}

impl Throttle {
    pub fn locked(&self) -> bool {
        match self.state.lock() {
            Ok(state) => state.1.map(|until| until > std::time::Instant::now()).unwrap_or(false),
            Err(_) => false,
        }
    }

    pub fn fail(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.0 += 1;
            if state.0 >= 5 {
                state.0 = 0;
                state.1 = Some(std::time::Instant::now() + std::time::Duration::from_secs(15));
            }
        }
    }

    pub fn ok(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.0 = 0;
            state.1 = None;
        }
    }
}

/// Genera una contraseña aleatoria legible.
pub fn random_password() -> String {
    let uuid = uuid::Uuid::new_v4().simple().to_string();
    uuid[..12].to_string()
}
