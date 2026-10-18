/**
 * Servidor estático mínimo para previsualizar el sitio (sin dependencias).
 * Uso:  node serve.mjs [puerto]
 * Cuando exista el backend real, esto se sustituye por la API de releases.
 */
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.argv[2] ?? 5173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const target = join(root, relative || "index.html");
  const file = target.endsWith("\\") || target.endsWith("/") ? join(target, "index.html") : target;

  if (!file.startsWith(root)) {
    response.writeHead(403).end("Prohibido");
    return;
  }

  let path = file;
  try {
    if (statSync(path).isDirectory()) path = join(path, "index.html");
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("No encontrado");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(path).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(response);
}).listen(port, () => {
  console.log(`Sitio MLA Server en http://localhost:${port}`);
});
