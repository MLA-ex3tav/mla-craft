/**
 * Sincroniza `website/assets/data/releases.json` con el último release de GitHub.
 *
 * Uso:
 *   node scripts/sync-release-manifest.mjs
 *
 * Variables:
 *   GITHUB_TOKEN  opcional; solo hace falta si el token se agota o el repo fuese privado.
 *
 * El sitio usa este archivo como respaldo cuando no hay backend (`/api/releases/latest`).
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = "MLA-ex3tav/mla-craft";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const target = join(root, "website", "assets", "data", "releases.json");

const headers = {
  accept: "application/vnd.github+json",
  "user-agent": "mla-craft-site",
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
if (!response.ok) {
  console.error(`No pude leer el último release (HTTP ${response.status}).`);
  console.error("¿Hay ya algún release publicado?");
  process.exit(1);
}

const release = await response.json();
const assets = Array.isArray(release.assets) ? release.assets : [];
const version = String(release.tag_name ?? release.name ?? "").replace(/^v/, "");

/** El instalador de NSIS es el que usa el updater en Windows. */
function pickWindows() {
  const candidates = assets.filter((asset) => /\.exe$/i.test(asset.name) && /setup/i.test(asset.name));
  return candidates[0] ?? assets.find((asset) => /\.exe$/i.test(asset.name)) ?? assets[0] ?? null;
}

const asset = pickWindows();
if (!asset) {
  console.error("El release no tiene ningún asset para Windows.");
  process.exit(1);
}

/** GitHub expone el digest del asset; si no, se descarga y se calcula. */
async function resolveHash(entry) {
  const digest = entry.digest;
  if (typeof digest === "string" && digest.startsWith("sha256:")) return digest.slice(7);
  if (!entry.browser_download_url) return null;
  try {
    const binary = await fetch(entry.browser_download_url, {
      headers: { "user-agent": "mla-craft-site" },
    });
    if (!binary.ok) return null;
    const buffer = Buffer.from(await binary.arrayBuffer());
    return createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}

const sha256 = await resolveHash(asset);
const totalDownloads = assets.reduce((sum, entry) => sum + (entry.download_count ?? 0), 0);
const arch = /arm64|aarch64/i.test(asset.name) ? "arm64" : "x64";

const manifest = {
  repo: `https://github.com/${repo}`,
  latest: {
    version,
    channel: release.prerelease ? "beta" : "stable",
    releasedAt: release.published_at ?? release.created_at ?? null,
    notesUrl: release.html_url ?? `https://github.com/${repo}/releases/latest`,
    totalDownloads,
    assets: [
      {
        id: `windows-${arch}`,
        platform: "windows",
        arch,
        label: "Windows 10 y 11 · 64 bits",
        file: asset.name,
        sizeBytes: asset.size ?? null,
        sha256,
        url: asset.browser_download_url,
      },
    ],
  },
};

writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Versión:   ${version}`);
console.log(`Archivo:   ${asset.name} (${((asset.size ?? 0) / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`SHA-256:   ${sha256 ?? "no disponible"}`);
console.log(`Descargas: ${totalDownloads}`);
console.log(`Escrito:   ${target}`);
