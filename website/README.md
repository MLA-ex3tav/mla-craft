# Sitio de descarga de MLA Server

Sitio público para descargar la app **MLA Server** (Windows). Es estático: no necesita
build ni dependencias.

## Previsualizar

Los botones de descarga abren un diálogo en la página. El diálogo usa el enlace
directo `.exe` o `.msi` del manifiesto; si todavía apunta a una página de release,
consulta la API pública de GitHub para encontrar el instalador Windows x64 del
último release estable. Si no está publicado o falla la consulta, muestra un aviso
y permite reintentar sin redirigir al visitante. No se necesitan credenciales.

Pruebas del selector de instaladores: `node --test website/scripts/downloads.test.mjs`.

```bash
cd "E:\MLA Craft\website"
node serve.mjs          # http://localhost:5173
```

También sirve cualquier servidor estático (`python -m http.server 5173`).

## Estructura

```
website/
├─ index.html                 # página única
├─ serve.mjs                  # servidor de previsualización (sin dependencias)
└─ assets/
   ├─ css/styles.css          # diseño completo
   ├─ js/main.js              # datos del release + interacciones
   ├─ data/releases.json      # manifiesto de respaldo (mientras no hay backend)
   └─ img/                    # hero, logos en WebP/PNG y bloques
```

## Cómo se alimenta de datos

`assets/js/main.js` intenta primero `GET /api/releases/latest` y, si no responde,
usa `assets/data/releases.json`. Cuando montemos el backend solo hay que devolver
esta misma forma y el sitio se actualiza solo:

```json
{
  "repo": "https://github.com/usuario/mla-craft",
  "latest": {
    "version": "0.2.0",
    "channel": "stable",
    "releasedAt": "2026-11-01T12:00:00Z",
    "notesUrl": "https://github.com/usuario/mla-craft/releases/latest",
    "totalDownloads": 1234,
    "assets": [
      {
        "id": "windows-x64",
        "platform": "windows",
        "arch": "x64",
        "label": "Windows 10 y 11 · 64 bits",
        "file": "MLA Server_0.2.0_x64-setup.exe",
        "sizeBytes": 18432000,
        "sha256": "…",
        "url": "https://github.com/usuario/mla-craft/releases/download/v0.2.0/…"
      }
    ]
  }
}
```

Otros puntos que el backend debe cubrir más adelante:

- `POST /api/downloads` — el sitio ya envía un beacon al pulsar el botón de descarga
  (plataforma, versión y origen). Sirve para contar descargas desde la web.
- Repositorio real: `MLA-ex3tav/mla-craft`, ya configurado en `releases.json`.

## Assets

Los originales viven en `../public` del proyecto de la app. Para regenerar las
versiones web (hero en WebP y logos a 512/192/96 px):

```bash
python scripts/build-assets.py
```

Requiere Pillow (`pip install pillow`).

## Pendiente (fase frontend)

- Sustituir el mockup CSS del panel por capturas reales cuando existan.
- Enlazar el repositorio definitivo y la comunidad (Discord, etc.).
- Revisar textos legales/licencias de Minecraft antes de publicar.
- Añadir página de changelog y política de privacidad si se publica en un dominio.
