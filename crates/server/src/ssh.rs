use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use russh::keys::{Algorithm, PrivateKey};
use russh::server::{Auth, ChannelOpenHandle, Msg, Server as _, Session};
use russh::{Channel, ChannelId};

use mla_craft_core::instance::ServerType;
use mla_craft_core::state::AppState;
use mla_craft_core::{api, instance};

const PROMPT: &str = "mla> ";

/// Servidor SSH que ofrece una shell restringida con comandos del app.
#[derive(Clone)]
pub struct SshServer {
    state: AppState,
    username: String,
    password_hash: String,
}

impl SshServer {
    pub fn new(state: AppState, username: String, password_hash: String) -> Self {
        Self {
            state,
            username,
            password_hash,
        }
    }
}

impl russh::server::Server for SshServer {
    type Handler = SshSession;

    fn new_client(&mut self, _peer: Option<std::net::SocketAddr>) -> SshSession {
        SshSession {
            state: self.state.clone(),
            username: self.username.clone(),
            password_hash: self.password_hash.clone(),
            channel: None,
            buffer: String::new(),
        }
    }
}

pub struct SshSession {
    state: AppState,
    username: String,
    password_hash: String,
    channel: Option<ChannelId>,
    buffer: String,
}

fn reply(session: &mut Session, channel: ChannelId, text: &str) {
    let _ = session.data(channel, text.as_bytes().to_vec());
}

impl SshSession {
    fn resolve<'a>(
        &self,
        instances: &'a [instance::InstanceView],
        query: &str,
    ) -> Option<&'a instance::InstanceView> {
        instances
            .iter()
            .find(|view| view.config.id == query || view.config.name.eq_ignore_ascii_case(query))
            .or_else(|| instances.iter().find(|view| view.config.id.starts_with(query)))
    }

    async fn execute(&mut self, command: &str, args: &[&str]) -> String {
        match command {
            "" => String::new(),
            "help" => concat!(
                "Comandos disponibles:\r\n",
                "  list                        Lista los servidores\r\n",
                "  status <servidor>           Estado de un servidor\r\n",
                "  start <servidor>            Arranca un servidor\r\n",
                "  stop <servidor>             Detiene un servidor\r\n",
                "  restart <servidor>          Reinicia un servidor\r\n",
                "  players <servidor>          Jugadores en línea\r\n",
                "  logs <servidor> [n]         Últimas n líneas del registro\r\n",
                "  install <servidor>          Instala el software del servidor\r\n",
                "  exit                        Cerrar la sesión\r\n"
            )
            .to_string(),
            "list" => match api::list_instances(&self.state) {
                Ok(list) if list.is_empty() => "No hay servidores.\r\n".to_string(),
                Ok(list) => {
                    let mut out = String::new();
                    for view in list {
                        out.push_str(&format!(
                            "  {:<28} {:<10} MC {:<10} {}\r\n",
                            view.config.name,
                            type_label(view.config.server_type),
                            view.config.mc_version,
                            if view.config.installed { "instalado" } else { "sin instalar" }
                        ));
                    }
                    out
                }
                Err(error) => format!("Error: {error}\r\n"),
            },
            "status" | "start" | "stop" | "restart" | "players" | "logs" | "install" => {
                let Some(target) = args.first().copied() else {
                    return format!("Uso: {command} <servidor>\r\n");
                };
                let instances = match api::list_instances(&self.state) {
                    Ok(list) => list,
                    Err(error) => return format!("Error: {error}\r\n"),
                };
                let Some(view) = self.resolve(&instances, target).cloned() else {
                    return format!("No se encontró el servidor «{target}».\r\n");
                };
                let id = view.config.id.clone();
                match command {
                    "status" => match api::server_status(&self.state, &id).await {
                        true => format!("{}: en ejecución\r\n", view.config.name),
                        false => format!("{}: detenido\r\n", view.config.name),
                    },
                    "start" => match api::start_server(&self.state, &id).await {
                        Ok(()) => format!("{}: iniciando…\r\n", view.config.name),
                        Err(error) => format!("Error: {error}\r\n"),
                    },
                    "stop" => match api::stop_server(&self.state, &id).await {
                        Ok(()) => format!("{}: deteniéndose…\r\n", view.config.name),
                        Err(error) => format!("Error: {error}\r\n"),
                    },
                    "restart" => match api::restart_server(&self.state, &id).await {
                        Ok(()) => format!("{}: reiniciando…\r\n", view.config.name),
                        Err(error) => format!("Error: {error}\r\n"),
                    },
                    "players" => match api::online_players(&self.state, &id).await {
                        Ok(players) if players.is_empty() => "Sin jugadores en línea.\r\n".to_string(),
                        Ok(players) => format!("{}\r\n", players.join(", ")),
                        Err(error) => format!("Error: {error}\r\n"),
                    },
                    "install" => match api::install_server(&self.state, &id).await {
                        Ok(_) => format!("{}: instalado.\r\n", view.config.name),
                        Err(error) => format!("Error: {error}\r\n"),
                    },
                    "logs" => {
                        let count = args.get(1).and_then(|v| v.parse().ok()).unwrap_or(30);
                        read_tail(&view.dir, count)
                    }
                    _ => String::new(),
                }
            }
            "exit" | "quit" => "Cerrando sesión.\r\n".to_string(),
            _ => format!("Comando desconocido: {command}. Escribe «help».\r\n"),
        }
    }
}

fn type_label(server_type: ServerType) -> &'static str {
    match server_type {
        ServerType::Vanilla => "Vanilla",
        ServerType::Paper => "Paper",
        ServerType::Spigot => "Spigot",
        ServerType::Fabric => "Fabric",
        ServerType::NeoForge => "NeoForge",
        ServerType::Forge => "Forge",
    }
}

fn read_tail(dir: &str, count: usize) -> String {
    let path = PathBuf::from(dir).join("logs").join("latest.log");
    match std::fs::read_to_string(path) {
        Ok(text) => {
            let lines: Vec<&str> = text.lines().collect();
            let start = lines.len().saturating_sub(count);
            let mut out = String::new();
            for line in &lines[start..] {
                out.push_str(line);
                out.push_str("\r\n");
            }
            out
        }
        Err(_) => "No hay registro disponible.\r\n".to_string(),
    }
}

impl russh::server::Handler for SshSession {
    type Error = anyhow::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        if user == self.username && crate::auth::verify_password(password, &self.password_hash) {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            })
        }
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply_handle: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.channel = Some(channel.id());
        let _ = reply_handle.accept();
        Ok(())
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _term: &str,
        _col: u32,
        _row: u32,
        _pix_w: u32,
        _pix_h: u32,
        _modes: &[(russh::Pty, u32)],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let _ = session.channel_success(channel);
        Ok(())
    }

    async fn env_request(
        &mut self,
        channel: ChannelId,
        _name: &str,
        _value: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let _ = session.channel_success(channel);
        Ok(())
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.channel = Some(channel);
        let _ = session.channel_success(channel);
        reply(
            session,
            channel,
            "MLA Server · shell restringida\r\nEscribe «help» para ver los comandos.\r\n\r\nmla> ",
        );
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.channel = Some(channel);
        let _ = session.channel_success(channel);
        let command = String::from_utf8_lossy(data).to_string();
        let parts: Vec<String> = command.split_whitespace().map(str::to_string).collect();
        let name = parts.first().cloned().unwrap_or_default();
        let rest: Vec<&str> = parts[1..].iter().map(String::as_str).collect();
        let output = self.execute(&name, &rest).await;
        reply(session, channel, &output);
        let _ = session.exit_status_request(channel, 0);
        let _ = session.eof(channel);
        let _ = session.close(channel);
        Ok(())
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let text = String::from_utf8_lossy(data).to_string();
        for ch in text.chars() {
            match ch {
                '\r' | '\n' => {
                    let line = std::mem::take(&mut self.buffer);
                    if matches!(line.trim(), "exit" | "quit") {
                        let _ = session.exit_status_request(channel, 0);
                        let _ = session.eof(channel);
                        let _ = session.close(channel);
                        return Ok(());
                    }
                    let parts: Vec<String> = line.split_whitespace().map(str::to_string).collect();
                    let name = parts.first().cloned().unwrap_or_default();
                    let rest: Vec<&str> = parts[1..].iter().map(String::as_str).collect();
                    let output = self.execute(&name, &rest).await;
                    reply(session, channel, &format!("\r\n{output}{PROMPT}"));
                }
                '\u{7f}' | '\u{8}' => {
                    if self.buffer.pop().is_some() {
                        let _ = session.data(channel, vec![0x08, b' ', 0x08]);
                    }
                }
                '\u{3}' => {
                    self.buffer.clear();
                    let _ = session.data(channel, b"\r\nmla> ".to_vec());
                }
                c if !c.is_control() => {
                    self.buffer.push(c);
                    let _ = session.data(channel, c.to_string().into_bytes());
                }
                _ => {}
            }
        }
        Ok(())
    }
}

/// Arranca el servidor SSH en segundo plano.
pub async fn serve(state: AppState, username: String, password_hash: String, port: u16) -> Result<()> {
    let config = Arc::new(russh::server::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
        auth_rejection_time: std::time::Duration::from_secs(1),
        keys: vec![PrivateKey::random(&mut rand10::rng(), Algorithm::Ed25519)
            .map_err(|e| anyhow::anyhow!("no se pudo generar la clave del servidor SSH: {e}"))?],
        ..Default::default()
    });
    let mut server = SshServer::new(state, username, password_hash);
    server
        .run_on_address(config, ("0.0.0.0", port))
        .await
        .map_err(|e| anyhow::anyhow!("servidor SSH: {e}"))
}
