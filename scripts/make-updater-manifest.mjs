/**
 * Genera `latest.json`, el manifiesto que lee el updater de Tauri, a partir de
 * los artefactos firmados de una compilación local.
 *
 * Uso:
 *   node scripts/make-updater-manifest.mjs [ruta-al-bundle]
 *
 * Por defecto busca en `target/release/bundle`. El manifiesto se escribe junto a
 * los artefactos, listo para subirlo al release con:
 *   gh release create v0.1.0 <archivos> --title "..." --notes "..."
 *
 * Cuando la versión se publica desde GitHub Actions, tauri-action crea este
 * archivo por su cuenta y no hace falta ejecutar esto.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = "MLA-ex3tav/mla-craft";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundleDir = resolve(process.argv[2] ?? join(root, "target", "release", "bundle"));

if (!existsSync(bundleDir)) {
  console.error(`No existe la carpeta de artefactos: ${bundleDir}`);
  console.error("Compila antes con: npm run tauri build");
  process.exit(1);
}

const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const version = config.version;
const tag = `v${version}`;

/** Busca recursivamente el instalador de NSIS y su firma. */
function findInstaller(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      const found = findInstaller(path);
      if (found) return found;
      continue;
    }
    if (/setup\.exe$/i.test(entry)) {
      const signature = `${path}.sig`;
      if (!existsSync(signature)) return { installer: path, signature: null };
      return { installer: path, signature };
    }
  }
  return null;
}

const found = findInstaller(bundleDir);
if (!found) {
  console.error(`No encontré ningún instalador "*-setup.exe" en ${bundleDir}`);
  process.exit(1);
}

if (!found.signature) {
  console.error(`Falta la firma ${basename(found.installer)}.sig.`);
  console.error("Compila con TAURI_SIGNING_PRIVATE_KEY y su contraseña configuradas.");
  process.exit(1);
}

const fileName = basename(found.installer);
const bytes = readFileSync(found.installer);
// GitHub sustituye los espacios por puntos al subir un asset, así que la URL
// pública no coincide con el nombre local del archivo.
const assetName = fileName.replace(/ /g, ".");
const manifest = {
  version,
  notes: `MLA Server ${tag}. Descarga desde https://mla-ex3tav.github.io/mla-craft/`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(found.signature, "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`,
    },
  },
};

const target = join(bundleDir, "latest.json");
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Instalador: ${fileName} (${(bytes.length / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`SHA-256:    ${createHash("sha256").update(bytes).digest("hex")}`);
console.log(`Manifiesto: ${target}`);
console.log(`\nPublica con:\n  gh release create ${tag} "${found.installer}" "${found.signature}" "${target}" --title "MLA Server ${tag}" --notes "MLA Server ${tag}"`);
