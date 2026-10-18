# MLA Server

Gestor de servidores de Minecraft para Windows: crea el servidor, instala el Java que
necesita, añade mods y plugins, programa copias de seguridad y administra jugadores
desde un panel de escritorio. Sin editar archivos ni escribir comandos.

> No afiliado a Mojang Studios. Minecraft es una marca de Mojang Studios.

## Qué incluye

- **Servidores**: Vanilla, Paper, Spigot, Fabric, Forge y NeoForge, con la versión de
  Minecraft y el build que elijas.
- **Java automático**: detecta y descarga el runtime que pide cada versión.
- **Contenido**: buscador de mods y plugins integrado, con activar/desactivar y borrado.
- **Backups y reinicios** programados, con retención configurable.
- **Jugadores**: lista blanca, operadores y sanciones; consulta salud, inventario y
  última muerte de cada jugador.
- **Consola y estado** en vivo, memoria, puerto y argumentos de la JVM.
- **Modo cooperativo (MCSR)** para speedrun y exportación/importación en `.mrpack`.
- **Panel remoto**: el mismo panel por HTTP con usuario y contraseña, más acceso SSH.

## Estructura

| Ruta | Qué es |
| --- | --- |
| `src/` | Frontend React del panel (Vite + Tailwind). |
| `src-tauri/` | App de escritorio Tauri y sus comandos. |
| `crates/core/` | Lógica compartida: instancias, descargas, proveedores, jugadores, backups. |
| `crates/server/` | Panel remoto headless: HTTP, sesiones, servicio de Windows y SSH. |
| `website/` | Sitio de descarga (estático, se publica en GitHub Pages). |
| `intro/` | Animación de arranque de la app. |
| `scripts/` | Utilidades: liberar el puerto 9999, manifiesto del updater y sincronización del sitio. |

## Desarrollo

Requisitos: Node 18+, Rust estable y WebView2 (incluido en Windows 10/11).

```bash
npm install
npm run tauri dev      # app de escritorio
npm run dev            # solo el frontend en http://localhost:9999
npm run typecheck      # comprobación de tipos
npm run tauri build    # instalador de Windows
```

El sitio de descarga:

```bash
cd website
node serve.mjs         # http://localhost:5173
```

## Panel remoto

```bash
cargo run -p mla-craft-server -- --host 0.0.0.0 --port 8722
```

La primera vez genera una contraseña y la muestra por consola; también admite
`--password`, `--data-dir`, `--ssh-port`, `--no-ssh`, `--install-service` y
`--uninstall-service`. Consulta `--help` para la lista completa.

## Actualizaciones automáticas

La app comprueba si hay una versión nueva al arrancar y avisa en el panel
(`UpdateBanner`), con el detalle en *Ajustes → Actualizaciones*. El canal es
GitHub Releases:

- Manifiesto: `https://github.com/MLA-ex3tav/mla-craft/releases/latest/download/latest.json`
- Firma: `minisign`. La clave privada vive **fuera del repo**, en
  `%USERPROFILE%\.tauri\mla-craft-updater.key` (y su contraseña en
  `mla-craft-updater.password`). En CI se guardan como secretos
  `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Si se pierde la clave o su contraseña, las instalaciones existentes dejarán de
  poder actualizarse y habrá que reinstalar a mano: guarda una copia.
- En Windows la instalación es `passive`: se descarga en segundo plano y se aplica
  al reiniciar la app.

## Publicar una versión

1. Sube la versión en `package.json` y en `src-tauri/tauri.conf.json`
   (deben coincidir con la etiqueta; el workflow lo verifica).
2. `git commit -am "Version 0.1.1" && git push origin main`
3. `git tag v0.1.1 && git push origin v0.1.1`

El workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) compila
en `windows-latest`, firma los instaladores, crea el release con `latest.json`,
actualiza `website/assets/data/releases.json` y publica el sitio.

### Compilar y firmar en local

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\mla-craft-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content "$env:USERPROFILE\.tauri\mla-craft-updater.password"
npm run tauri build
node scripts/make-updater-manifest.mjs   # genera latest.json junto a los bundles
```

## Descargas y versiones

Los instaladores se publican en [Releases](../../releases). El sitio de descarga lee
`GET /api/releases/latest` si el backend está disponible y, si no, usa
`website/assets/data/releases.json` como respaldo. Para regenerar ese respaldo a
partir del último release:

```bash
node scripts/sync-release-manifest.mjs
```

## Licencia

MIT. Consulta [`LICENSE`](LICENSE). El proyecto no está afiliado a Mojang Studios.

## Convenciones de diseño

Las reglas visuales del proyecto están en [`AGENTS.md`](AGENTS.md). En resumen: el
contenido va directamente sobre el paisaje de Minecraft, sin grandes paneles blancos
en pantallas vacías ni en listas sin resultados.
