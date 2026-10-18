use std::path::Path;
use std::process::Command;

use mla_craft_core::error::{AppError, AppResult};

const WINDOWS_TASK: &str = "MLA Craft Server";

/// Instala el servidor como servicio (Windows: tarea programada al arranque; Linux: systemd).
pub fn install(data_dir: &Path, host: &str, port: u16) -> AppResult<()> {
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Message(format!("No se pudo localizar el ejecutable: {e}")))?;
    let exe = exe.display().to_string();
    let dir = data_dir.display().to_string();

    #[cfg(windows)]
    {
        // Una tarea al arranque como SYSTEM funciona sin sesión gráfica.
        let action = format!("\"{exe}\" --data-dir \"{dir}\" --host {host} --port {port}");
        let status = Command::new("schtasks")
            .args([
                "/Create",
                "/TN",
                WINDOWS_TASK,
                "/TR",
                &action,
                "/SC",
                "ONSTART",
                "/RU",
                "SYSTEM",
                "/RL",
                "HIGHEST",
                "/F",
            ])
            .status()
            .map_err(|e| AppError::Message(format!("No se pudo invocar schtasks: {e}")))?;
        if !status.success() {
            return Err(AppError::Message(
                "schtasks falló. Ejecuta la consola como administrador.".into(),
            ));
        }
        println!("Servicio instalado (tarea «{WINDOWS_TASK}»). Arrancará al iniciar el sistema.");
        println!("Inícialo ahora con: schtasks /Run /TN \"{WINDOWS_TASK}\"");
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let unit = format!(
            "[Unit]\nDescription=MLA Server manager\nAfter=network.target\n\n[Service]\nExecStart={exe} --data-dir \"{dir}\" --host {host} --port {port}\nRestart=on-failure\nUser=root\n\n[Install]\nWantedBy=multi-user.target\n"
        );
        let path = "/etc/systemd/system/mla-craft.service";
        std::fs::write(path, unit)
            .map_err(|e| AppError::Message(format!("No se pudo escribir {path}: {e}")))?;
        for args in [
            vec!["daemon-reload"],
            vec!["enable", "mla-craft.service"],
            vec!["restart", "mla-craft.service"],
        ] {
            let _ = Command::new("systemctl").args(args).status();
        }
        println!("Servicio systemd instalado y arrancado: mla-craft.service");
        Ok(())
    }
}

pub fn uninstall() -> AppResult<()> {
    #[cfg(windows)]
    {
        let status = Command::new("schtasks")
            .args(["/Delete", "/TN", WINDOWS_TASK, "/F"])
            .status()
            .map_err(|e| AppError::Message(format!("No se pudo invocar schtasks: {e}")))?;
        if !status.success() {
            return Err(AppError::Message(
                "No se pudo eliminar la tarea. Ejecuta como administrador.".into(),
            ));
        }
        println!("Servicio desinstalado.");
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = Command::new("systemctl")
            .args(["disable", "--now", "mla-craft.service"])
            .status();
        let _ = std::fs::remove_file("/etc/systemd/system/mla-craft.service");
        let _ = Command::new("systemctl").args(["daemon-reload"]).status();
        println!("Servicio systemd desinstalado.");
        Ok(())
    }
}

pub fn usage() {
    println!(
        "MLA Server - servidor headless\n\n\
Uso: mla-craft-server [opciones]\n\n\
Opciones:\n\
  --data-dir <ruta>     Carpeta de datos (por defecto %APPDATA%\\MLA Craft o ~/.local/share)\n\
  --host <ip>           Interfaz de escucha (por defecto 0.0.0.0)\n\
  --port <puerto>       Puerto del panel (por defecto 8722)\n\
  --user <usuario>      Usuario del panel (por defecto admin)\n\
  --password <clave>    Establece/cambia la contraseña del panel\n\
  --web-dir <ruta>      Carpeta del panel web (por defecto ./dist)\n\
  --ssh-port <puerto>   Puerto SSH de la shell restringida (por defecto 2222)\n\
  --no-ssh              Desactiva el servidor SSH\n\
  --install-service     Instala como servicio (tareas Windows / systemd)\n\
  --uninstall-service   Desinstala el servicio\n\
  --help                Muestra esta ayuda"
    );
}
