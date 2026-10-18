/* =========================================================
   MLA Server · sitio de descarga
   Datos de release + interacciones de la página
   =========================================================

   Backend (fase siguiente): expón `GET /api/releases/latest`
   con esta misma forma y el sitio lo usará automáticamente.
   Si el endpoint no responde, se usa assets/data/releases.json.
   ========================================================= */

const FALLBACK_MANIFEST = "assets/data/releases.json";
const API_MANIFEST = "/api/releases/latest";
const DOWNLOAD_BEACON = "/api/downloads";

/** Muestra u oculta la hora de la verdad: plataforma objetivo del sitio. */
const TARGET_PLATFORM = "windows";

/* ---------- Utilidades ---------- */

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const nf = new Intl.NumberFormat("es-ES");

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function shortenHash(hash) {
  if (!hash || hash.length < 20) return null;
  return `${hash.slice(0, 12)}…${hash.slice(-10)}`;
}

function isWindows() {
  const ua = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  return /win/i.test(ua);
}

/* ---------- Carga del manifiesto ---------- */

async function loadManifest() {
  const sources = [API_MANIFEST, FALLBACK_MANIFEST];
  for (const source of sources) {
    try {
      const response = await fetch(source, { headers: { accept: "application/json" } });
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.latest?.version) return { data, source };
    } catch {
      /* siguiente fuente */
    }
  }
  return null;
}

function pickAsset(manifest) {
  const assets = manifest?.latest?.assets ?? [];
  return (
    assets.find((asset) => asset.platform === TARGET_PLATFORM && asset.kind !== "portable") ??
    assets.find((asset) => asset.platform === TARGET_PLATFORM) ??
    assets[0] ??
    null
  );
}

/* ---------- Pintado de la página ---------- */

function applyManifest(manifest, repo) {
  const { latest } = manifest;
  const asset = pickAsset(manifest);
  const versionLabel = `v${String(latest.version).replace(/^v/i, "")}`;
  const releaseUrl = latest.notesUrl || asset?.url || repo;

  $$("[data-release-version]").forEach((el) => { el.textContent = versionLabel; });
  $$("[data-release-date]").forEach((el) => { el.textContent = formatDate(latest.releasedAt); });
  $$("[data-release-size]").forEach((el) => { el.textContent = formatBytes(asset?.sizeBytes); });
  $$("[data-release-downloads]").forEach((el) => {
    el.textContent = Number.isFinite(latest.totalDownloads) ? nf.format(latest.totalDownloads) : "—";
  });

  const hash = asset?.sha256 ?? "";
  $$("[data-release-hash]").forEach((el) => {
    el.textContent = shortenHash(hash) ?? "se publica junto al instalador";
    if (hash) el.title = hash;
  });
  $$("[data-copy-hash]").forEach((button) => {
    button.hidden = !hash;
    button.dataset.hash = hash;
  });

  $$("[data-download-link]").forEach((link) => {
    link.href = asset?.url || releaseUrl;
    link.dataset.version = versionLabel;
    if (asset?.file) link.title = asset.file;
  });

  $$("[data-download-label]").forEach((el) => {
    el.textContent = isWindows() ? "Descargar para Windows" : "Ver descarga para Windows";
  });

  const osLine = asset?.label ? `${asset.label}` : "Windows 10 y 11 · 64 bits";
  $$("[data-release-os]").forEach((el) => { el.textContent = osLine; });

  $$("[data-download-hint]").forEach((el) => {
    el.textContent = isWindows()
      ? "Se abre la página del último release en GitHub con todos los archivos."
      : "Este instalador es para Windows. El enlace te lleva al último release en GitHub.";
  });

  $$("[data-repo-link]").forEach((link) => { link.href = repo; });

  document.documentElement.dataset.release = versionLabel;
  document.title = `MLA Server ${versionLabel} — Descarga para Windows`;
}

/* ---------- Interacciones ---------- */

function setupReveals() {
  const targets = $$("[data-reveal]");
  if (!targets.length) return;

  const showAll = () => targets.forEach((el) => el.classList.add("is-visible"));

  if (!("IntersectionObserver" in window)) {
    showAll();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  );
  targets.forEach((el, index) => {
    el.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
    observer.observe(el);
  });

  // Red de seguridad: nada se queda invisible si el observador no dispara.
  setTimeout(showAll, 2500);
}

function setupTopbar() {
  const topbar = $("#topbar");
  if (!topbar) return;
  const update = () => topbar.classList.toggle("is-stuck", window.scrollY > 24);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function setupCopyHash() {
  $$("[data-copy-hash]").forEach((button) => {
    button.addEventListener("click", async () => {
      const hash = button.dataset.hash || "";
      if (!hash) return;
      try {
        await navigator.clipboard.writeText(hash);
        const original = button.textContent;
        button.textContent = "Copiado";
        setTimeout(() => { button.textContent = original; }, 1600);
      } catch {
        /* portapapeles no disponible */
      }
    });
  });
}

function setupDownloadTracking() {
  $$("[data-download-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      const payload = JSON.stringify({
        platform: TARGET_PLATFORM,
        version: document.documentElement.dataset.release ?? null,
        source: el.classList.contains("btn-block") ? "download-card" : "cta",
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(DOWNLOAD_BEACON, new Blob([payload], { type: "application/json" }));
        } else {
          fetch(DOWNLOAD_BEACON, { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
        }
      } catch {
        /* el contador se conecta con el backend */
      }
    });
  });
}

function setupYear() {
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
}

/* ---------- Arranque ---------- */

async function init() {
  setupTopbar();
  setupReveals();
  setupCopyHash();
  setupDownloadTracking();
  setupYear();

  const loaded = await loadManifest();
  if (!loaded) return;
  const repo = loaded.data.repo || "https://github.com/";
  applyManifest(loaded.data, repo);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
