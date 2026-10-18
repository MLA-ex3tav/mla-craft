use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

pub use crate::events::{LogLine, ServerState, StateChange, LOG_EVENT, STATE_EVENT};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::instance::{Instance, ServerType};
use crate::state::AppState;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Servidor en ejecución.
pub struct RunningServer {
    pub child: Child,
    pub stdin: Option<ChildStdin>,
    pub mcsr_coop: bool,
}

pub type ProcessMap = Arc<Mutex<HashMap<String, RunningServer>>>;

pub fn new_process_map() -> ProcessMap {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Estado de jugadores en línea de una instancia.
#[derive(Debug, Clone, Default)]
pub struct OnlineMap {
    pub players: Vec<String>,
    /// Líneas restantes a inspeccionar buscando la respuesta de `list`.
    pub pending: u32,
}

/// Interpreta la respuesta del comando `list` de forma independiente del idioma.
///
/// El formato es `<texto localizado>: nombre1, nombre2` (o termina en `:` si no
/// hay jugadores), por lo que tomamos lo que hay tras el último `:`.
pub fn parse_list_response(line: &str) -> Option<Vec<String>> {
    if line.contains("issued server command") {
        return None;
    }
    let index = line.rfind(':')?;
    let tail = line[index + 1..].trim();
    if tail.is_empty() {
        return Some(Vec::new());
    }
    let mut players = Vec::new();
    for part in tail.split(',') {
        let name = part.trim();
        let valid = !name.is_empty()
            && name.len() <= 16
            && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !valid {
            return None;
        }
        players.push(name.to_string());
    }
    Some(players)
}

fn update_online(state: &AppState, id: &str, line: &str) {
    let Ok(mut map) = state.online.lock() else {
        return;
    };
    let Some(entry) = map.get_mut(id) else {
        return;
    };
    if entry.pending == 0 {
        return;
    }
    match parse_list_response(line) {
        Some(players) => {
            entry.players = players;
            entry.pending = 0;
        }
        None => entry.pending = entry.pending.saturating_sub(1),
    }
}

fn clear_online(state: &AppState, id: &str) {
    if let Ok(mut map) = state.online.lock() {
        map.remove(id);
    }
}

/// Localiza el archivo `win_args.txt`/`unix_args.txt` generado por los instaladores de Forge/NeoForge.
fn find_args_file(dir: &Path) -> Option<String> {
    let name = if cfg!(windows) {
        "win_args.txt"
    } else {
        "unix_args.txt"
    };
    let libs = dir.join("libraries");
    if !libs.exists() {
        return None;
    }
    for entry in walkdir::WalkDir::new(&libs)
        .into_iter()
        .filter_map(Result::ok)
    {
        if entry.file_name() == std::ffi::OsStr::new(name) {
            let rel = entry.path().strip_prefix(dir).ok()?;
            return Some(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    None
}

/// Construye el comando para arrancar el servidor.
pub fn build_command(instance: &Instance, dir: &Path) -> AppResult<Command> {
    let java = instance
        .java_path
        .clone()
        .ok_or_else(|| AppError::Message("El servidor no tiene un Java asignado.".into()))?;

    let mut args: Vec<String> = vec![
        format!("-Xms{}M", instance.memory_min_mb),
        format!("-Xmx{}M", instance.memory_max_mb),
        "-Dfile.encoding=UTF-8".to_string(),
        "-Dsun.stdout.encoding=UTF-8".to_string(),
        "-Dsun.stderr.encoding=UTF-8".to_string(),
    ];
    args.extend(instance.jvm_args.iter().cloned());

    let uses_args_file = matches!(instance.server_type, ServerType::Forge | ServerType::NeoForge);
    if uses_args_file {
        if let Some(args_file) = find_args_file(dir) {
            args.push(format!("@{args_file}"));
            args.push("nogui".to_string());
        } else {
            args.push("-jar".to_string());
            args.push("server.jar".to_string());
            args.push("nogui".to_string());
        }
    } else {
        args.push("-jar".to_string());
        args.push("server.jar".to_string());
        args.push("nogui".to_string());
    }

    let mut cmd = if instance.mcsr_coop {
        crate::mcsr::prepare(instance, dir, &java, &args)?;
        let mut wrapper = Command::new("node");
        wrapper.arg("server.js");
        wrapper
    } else {
        let mut java_command = Command::new(java);
        java_command.args(&args);
        java_command
    };
    cmd.current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    Ok(cmd)
}

async fn stream_lines<R>(reader: R, mut on_line: impl FnMut(&str) + Send + 'static)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        on_line(&line);
    }
}

/// Ejecuta el instalador de Forge/NeoForge y reenvía su salida a la consola.
pub async fn run_installer(
    state: &AppState,
    id: &str,
    java: &str,
    dir: &Path,
    jar: &str,
) -> AppResult<()> {
    let mut cmd = Command::new(java);
    cmd.args(["-jar", jar, "--installServer"])
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Message(format!("No se pudo ejecutar el instalador: {e}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(stdout) = stdout {
        let state = state.clone();
        let id = id.to_string();
        tokio::spawn(async move {
            stream_lines(stdout, move |line| state.bus.log(&id, line)).await;
        });
    }
    if let Some(stderr) = stderr {
        let state = state.clone();
        let id = id.to_string();
        tokio::spawn(async move {
            stream_lines(stderr, move |line| state.bus.log(&id, line)).await;
        });
    }

    let status = child.wait().await?;
    if !status.success() {
        return Err(AppError::Message(
            "El instalador terminó con error. Revisa la consola.".into(),
        ));
    }
    Ok(())
}

/// Arranca el servidor y conecta su salida a eventos.
pub async fn start(state: &AppState, instance: &Instance, dir: &Path) -> AppResult<()> {
    let mut cmd = build_command(instance, dir)?;
    let mut child = cmd.spawn().map_err(|e| {
        AppError::Message(format!(
            "No se pudo iniciar el servidor (MCSR requiere Node.js en PATH): {e}"
        ))
    })?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let id = instance.id.clone();
    let mcsr_coop = instance.mcsr_coop;

    if let Some(stdout) = stdout {
        let state = state.clone();
        let id = id.clone();
        tokio::spawn(async move {
            stream_lines(stdout, move |line| {
                state.bus.log(&id, line);
                if mcsr_coop && line == "[MLA MCSR] STARTING" {
                    clear_online(&state, &id);
                    state.bus.state(&id, ServerState::Starting);
                }
                if (!mcsr_coop && line.contains("Done ("))
                    || (mcsr_coop && line == "[MLA MCSR] Servidor listo; save-off enviado.")
                {
                    state.bus.state(&id, ServerState::Running);
                }
                if line.contains(" has the following entity data: ") {
                    let _ = state.player_logs.send((id.clone(), line.to_string()));
                }
                update_online(&state, &id, line);
            })
            .await;
        });
    }

    if let Some(stderr) = stderr {
        let state = state.clone();
        let id = id.clone();
        tokio::spawn(async move {
            stream_lines(stderr, move |line| state.bus.log(&id, line)).await;
        });
    }

    state.processes.lock().await.insert(
        id.clone(),
        RunningServer {
            child,
            stdin,
            mcsr_coop,
        },
    );

    state.bus.state(&id, ServerState::Starting);

    // Inicializa el estado de jugadores en línea para esta instancia.
    if let Ok(mut online) = state.online.lock() {
        online.insert(id.clone(), OnlineMap::default());
    }

    // Vigila la salida del proceso.
    let state = state.clone();
    let id = id.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            let mut map = state.processes.lock().await;
            let Some(server) = map.get_mut(&id) else {
                return;
            };
            match server.child.try_wait() {
                Ok(Some(status)) => {
                    map.remove(&id);
                    drop(map);
                    clear_online(&state, &id);
                    let next = if status.success() {
                        ServerState::Stopped
                    } else {
                        ServerState::Crashed
                    };
                    state.bus.state(&id, next);
                    return;
                }
                Ok(None) => {}
                Err(_) => {
                    map.remove(&id);
                    drop(map);
                    clear_online(&state, &id);
                    state.bus.state(&id, ServerState::Crashed);
                    return;
                }
            }
        }
    });

    Ok(())
}

pub async fn send_command(processes: &ProcessMap, id: &str, command: &str) -> AppResult<()> {
    let mut map = processes.lock().await;
    let server = map
        .get_mut(id)
        .ok_or_else(|| AppError::Message("El servidor no está en ejecución.".into()))?;
    let stdin = server
        .stdin
        .as_mut()
        .ok_or_else(|| AppError::Message("Sin entrada estándar disponible.".into()))?;
    stdin.write_all(command.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    stdin.flush().await?;
    Ok(())
}

pub async fn is_running(processes: &ProcessMap, id: &str) -> bool {
    processes.lock().await.contains_key(id)
}

/// Detiene el servidor de forma ordenada (`stop`) y, si no responde, lo mata.
pub async fn stop(state: &AppState, id: &str) -> AppResult<()> {
    state.bus.state(id, ServerState::Stopping);

    let mcsr = state
        .processes
        .lock()
        .await
        .get(id)
        .map(|server| server.mcsr_coop)
        .unwrap_or(false);
    let stop_command = if mcsr { "__MLA_MCSR_SHUTDOWN__" } else { "stop" };
    if send_command(&state.processes, id, stop_command).await.is_err() {
        // Sin stdin: matar directamente.
        kill(&state.processes, id).await;
        return Ok(());
    }

    // Esperar hasta 30s a que termine.
    for _ in 0..60 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if !is_running(&state.processes, id).await {
            return Ok(());
        }
    }

    kill(&state.processes, id).await;
    Ok(())
}

pub async fn kill(processes: &ProcessMap, id: &str) {
    let mut map = processes.lock().await;
    if let Some(server) = map.get_mut(id) {
        // Keep the wrapper alive until it has reaped Java; killing Node alone orphans Java.
        if server.mcsr_coop {
            if let Some(stdin) = server.stdin.as_mut() {
                if stdin.write_all(b"__MLA_MCSR_FORCE_STOP__\n").await.is_ok() {
                    let _ = stdin.flush().await;
                    return;
                }
            }
            #[cfg(windows)]
            if let Some(pid) = server.child.id() {
                let mut taskkill = Command::new("taskkill");
                taskkill.args(["/PID", &pid.to_string(), "/T", "/F"]);
                taskkill.creation_flags(CREATE_NO_WINDOW);
                let _ = taskkill.output().await;
            }
        }
        let _ = server.child.start_kill();
    }
}

#[cfg(test)]
mod tests {
    use super::parse_list_response;

    #[test]
    fn parses_english_list() {
        let line = "[12:00:00] [Server thread/INFO]: There are 2 of a max of 20 players online: Steve, Alex_99";
        assert_eq!(
            parse_list_response(line),
            Some(vec!["Steve".to_string(), "Alex_99".to_string()])
        );
    }

    #[test]
    fn parses_spanish_empty_list() {
        let line =
            "[12:00:00] [Server thread/INFO]: Hay 0 de un máximo de 20 jugadores en línea:";
        assert_eq!(parse_list_response(line), Some(Vec::new()));
    }

    #[test]
    fn ignores_non_list_lines() {
        assert_eq!(parse_list_response("Preparing spawn area: 50%"), None);
        assert_eq!(
            parse_list_response("Starting minecraft server version 1.20.4"),
            None
        );
        assert_eq!(
            parse_list_response("[Server thread/INFO]: Steve issued server command: /list"),
            None
        );
        assert_eq!(
            parse_list_response("[Server thread/INFO]: Steve joined the game"),
            None
        );
    }

    #[test]
    fn keeps_valid_list_line_without_timestamp() {
        assert_eq!(
            parse_list_response("players online: Notch"),
            Some(vec!["Notch".to_string()])
        );
    }
}
