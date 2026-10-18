mod auth;
mod bus;
mod dispatch;
mod service;
mod ssh;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, Request, State};
use axum::http::{header::AUTHORIZATION, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tower_http::services::{ServeDir, ServeFile};

use mla_craft_core::state::AppState;
use mla_craft_core::{paths, scheduler};

use auth::{hash_password, random_password, verify_password, ServerConfig, Sessions, Throttle};
use bus::WebBus;

#[derive(Clone)]
struct Shared {
    state: AppState,
    username: String,
    password_hash: String,
    sessions: Arc<Sessions>,
    throttle: Arc<Throttle>,
    events: tokio::sync::broadcast::Sender<String>,
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct InvokeRequest {
    command: String,
    #[serde(default)]
    args: Option<Value>,
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    if arg_flag(&args, "--help") || arg_flag(&args, "-h") {
        service::usage();
        return;
    }

    let data_dir = arg_value(&args, "--data-dir")
        .map(PathBuf::from)
        .unwrap_or_else(paths::data_dir);
    let _ = paths::ensure_dir(&data_dir);

    // Configuración (usuario/contraseña/host/puerto).
    let mut config = ServerConfig::load(&data_dir).unwrap_or_else(|| ServerConfig {
        username: arg_value(&args, "--user").unwrap_or_else(|| "admin".to_string()),
        password_hash: String::new(),
        host: "0.0.0.0".to_string(),
        port: 8722,
    });

    let provided_password = arg_value(&args, "--password");
    let generated = provided_password.is_none();
    if config.password_hash.is_empty() || provided_password.is_some() {
        let password = provided_password.unwrap_or_else(random_password);
        config.username = arg_value(&args, "--user").unwrap_or(config.username);
        config.password_hash = hash_password(&password).expect("no se pudo proteger la contraseña");
        if let Err(error) = config.save(&data_dir) {
            eprintln!("No se pudo guardar la configuración: {error}");
        }
        if generated {
            println!("──────────────────────────────────────────────");
            println!(" Contraseña generada para el panel:");
            println!("   usuario:   {}", config.username);
            println!("   contraseña: {password}");
            println!(" (cámbiala con --password la próxima vez)");
            println!("──────────────────────────────────────────────");
        }
    }

    if let Some(host) = arg_value(&args, "--host") {
        config.host = host;
    }
    if let Some(port) = arg_value(&args, "--port").and_then(|p| p.parse().ok()) {
        config.port = port;
    }

    if arg_flag(&args, "--install-service") {
        if let Err(error) = service::install(&data_dir, &config.host, config.port) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    if arg_flag(&args, "--uninstall-service") {
        if let Err(error) = service::uninstall() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    let (events_tx, _) = tokio::sync::broadcast::channel(4096);
    let bus = Arc::new(WebBus::new(events_tx.clone()));
    let state = AppState::new(data_dir.clone(), bus);

    // Planificador de backups/reinicios.
    tokio::spawn(scheduler::run(state.clone()));

    let shared = Shared {
        state,
        username: config.username.clone(),
        password_hash: config.password_hash.clone(),
        sessions: Arc::new(Sessions::default()),
        throttle: Arc::new(Throttle::default()),
        events: events_tx,
    };

    let ssh_port = arg_value(&args, "--ssh-port")
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(2222);
    if ssh_port > 0 && !arg_flag(&args, "--no-ssh") {
        let ssh_state = shared.state.clone();
        let ssh_user = shared.username.clone();
        let ssh_hash = shared.password_hash.clone();
        tokio::spawn(async move {
            if let Err(error) = ssh::serve(ssh_state, ssh_user, ssh_hash, ssh_port).await {
                eprintln!("SSH: {error}");
            }
        });
        println!("SSH (shell restringida con comandos del app) en el puerto {ssh_port}");
    }

    let web_dir = resolve_web_dir(arg_value(&args, "--web-dir"));
    if !web_dir.join("index.html").exists() {
        eprintln!(
            "Aviso: no se encontró el panel web en «{}». Compila el frontend (npm run build) o pasa --web-dir.",
            web_dir.display()
        );
    }

    let protected = Router::new()
        .route("/api/invoke", post(invoke))
        .route("/api/auth/logout", post(logout))
        .layer(middleware::from_fn_with_state(shared.clone(), require_auth));

    let index = web_dir.join("index.html");
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/login", post(login))
        .route("/api/events", get(ws_events))
        .merge(protected)
        .fallback_service(ServeDir::new(web_dir.clone()).fallback(ServeFile::new(index)))
        .with_state(shared);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .expect("dirección no válida");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| panic!("No se pudo escuchar en {addr}: {e}"));

    println!("MLA Server (headless) escuchando en http://{addr}");
    println!("Panel web: {}", web_dir.display());
    println!("Datos: {}", data_dir.display());

    axum::serve(listener, app).await.expect("el servidor terminó con error");
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

fn arg_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|a| a == name)
}

fn resolve_web_dir(explicit: Option<String>) -> PathBuf {
    if let Some(dir) = explicit {
        return PathBuf::from(dir);
    }
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));
    let cwd = std::env::current_dir().ok();
    let candidates = [
        exe_dir.as_ref().map(|p| p.join("web")),
        cwd.as_ref().map(|p| p.join("web")),
        cwd.as_ref().map(|p| p.join("dist")),
        exe_dir.as_ref().map(|p| p.join("../dist")),
        cwd.as_ref().map(|p| p.join("../../dist")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.join("index.html").exists() {
            return candidate;
        }
    }
    cwd.map(|p| p.join("dist")).unwrap_or_else(|| PathBuf::from("dist"))
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "service": "mla-craft-server" }))
}

async fn login(State(shared): State<Shared>, Json(body): Json<LoginRequest>) -> Response {
    if shared.throttle.locked() {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            "Demasiados intentos. Espera unos segundos.",
        )
            .into_response();
    }
    if body.username != shared.username || !verify_password(&body.password, &shared.password_hash) {
        shared.throttle.fail();
        return (StatusCode::UNAUTHORIZED, "Credenciales incorrectas").into_response();
    }
    shared.throttle.ok();
    let token = shared.sessions.start();
    Json(json!({ "token": token, "username": shared.username })).into_response()
}

async fn logout(State(shared): State<Shared>, request: Request) -> Response {
    if let Some(token) = bearer(&request) {
        shared.sessions.revoke(&token);
    }
    Json(json!({ "ok": true })).into_response()
}

async fn invoke(
    State(shared): State<Shared>,
    Json(body): Json<InvokeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let args = body.args.unwrap_or_else(|| json!({}));
    dispatch::dispatch(&shared.state, &body.command, &args)
        .await
        .map(Json)
        .map_err(|error| (StatusCode::BAD_REQUEST, error.to_string()))
}

async fn ws_events(
    State(shared): State<Shared>,
    Query(params): Query<HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> Response {
    let token = params.get("token").cloned().unwrap_or_default();
    if !shared.sessions.is_valid(&token) {
        return (StatusCode::UNAUTHORIZED, "Sesión no válida").into_response();
    }
    let receiver = shared.events.subscribe();
    ws.on_upgrade(move |socket| forward_events(socket, receiver))
}

async fn forward_events(mut socket: WebSocket, mut receiver: tokio::sync::broadcast::Receiver<String>) {
    while let Ok(message) = receiver.recv().await {
        if socket.send(Message::Text(message.into())).await.is_err() {
            break;
        }
    }
}

async fn require_auth(State(shared): State<Shared>, request: Request, next: Next) -> Response {
    match bearer(&request) {
        Some(token) if shared.sessions.is_valid(&token) => next.run(request).await,
        _ => (StatusCode::UNAUTHORIZED, "Sesión no válida").into_response(),
    }
}

fn bearer(request: &Request) -> Option<String> {
    request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_string)
}
