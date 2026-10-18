/* =========================================================
   MLA Server · sitio de descarga
   Datos de release + interacciones de la página
   =========================================================

   Backend (fase siguiente): expón `GET /api/releases/latest`
   con esta misma forma y el sitio lo usará automáticamente.
   Si el endpoint no responde, se usa assets/data/releases.json.
   ========================================================= */

import { installerUrl, githubReleaseEndpoint, pickWindowsInstaller } from "./downloads.js";

const FALLBACK_MANIFEST = "assets/data/releases.json";
const API_MANIFEST = "/api/releases/latest";
const DOWNLOAD_BEACON = "/api/downloads";

/** Muestra u oculta la hora de la verdad: plataforma objetivo del sitio. */
const TARGET_PLATFORM = "windows";
let manifestRequest;
const getManifest = () => manifestRequest ??= loadManifest();

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
      const response = await fetch(source, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
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
    link.href = "#descargar";
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
      ? "Consulta la versión y descarga el instalador sin salir de esta página."
      : "Este instalador es para Windows. Puedes descargarlo aquí para usarlo en tu PC.";
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

  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showAll();
    return;
  }

  document.documentElement.classList.add("reveal-ready");
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

}

function setupNavigation() {
  const toggle = $(".menu-toggle");
  const nav = $("#site-nav");
  const close = () => {
    toggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  });
  nav.addEventListener("click", (event) => { if (event.target.closest("a")) close(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      close();
      toggle.focus();
    }
  });
  document.addEventListener("click", (event) => { if (!event.target.closest(".topbar")) close(); });
  matchMedia("(min-width: 861px)").addEventListener("change", close);
  if (!("IntersectionObserver" in window)) return;
  const sections = $$("main section[id]");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      $$("a", nav).forEach((link) => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-15% 0px -55% 0px", threshold: 0 });
  sections.forEach((section) => observer.observe(section));
}

function setupAtmosphere() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = matchMedia("(hover: hover) and (pointer: fine)");
  const hero = $(".hero");
  let queued = false;
  const update = () => {
    queued = false;
    const offset = reduced.matches ? 0 : Math.min(window.scrollY * .12, 24);
    hero.style.setProperty("--landscape-y", `${offset}px`);
  };
  const schedule = () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  };
  window.addEventListener("scroll", schedule, { passive: true });
  reduced.addEventListener("change", () => {
    update();
    if (reduced.matches) $$("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
  });
  $$(".feature").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      if (reduced.matches || !pointer.matches) return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
      card.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
    });
  });
  update();
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
  $$("[data-direct-download]").forEach((el) => {
    el.addEventListener("click", () => {
      const payload = JSON.stringify({
        platform: TARGET_PLATFORM,
        version: el.dataset.version ?? document.documentElement.dataset.release ?? null,
        source: "download-dialog",
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

function setupDownloadDialog() {
  const dialog = $("#download-dialog");
  const status = $("[data-dialog-status]");
  const action = $("[data-direct-download]");
  const retry = $("[data-retry-download]");
  const file = $(".dialog-file");
  let requestId = 0;
  let opener;
  const prepare = async () => {
    const id = ++requestId;
    action.hidden = retry.hidden = file.hidden = true;
    action.removeAttribute("href");
    dialog.setAttribute("aria-busy", "true");
    status.textContent = "Consultando la versión disponible…";
    try {
      const loaded = await getManifest();
      if (!loaded) throw new Error("manifest");
      let asset = pickAsset(loaded.data);
      let version = loaded.data.latest.version;
      let url = asset?.platform === "windows" ? installerUrl(asset.url, location.href) : null;
      if (!url) {
        const endpoint = githubReleaseEndpoint(loaded.data.repo);
        if (!endpoint) throw new Error("repository");
        const response = await fetch(endpoint, { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("release");
        const release = await response.json();
        const installer = pickWindowsInstaller(release.assets);
        url = installerUrl(installer?.browser_download_url, location.href);
        if (!url || release.draft || release.prerelease) throw new Error("installer");
        asset = { file: installer.name, sizeBytes: installer.size, label: "Windows 10 y 11 · 64 bits" };
        version = release.tag_name;
      }
      if (id !== requestId || !dialog.open) return;
      $("[data-dialog-file]").textContent = asset.file || "Instalador de MLA Server";
      $("[data-dialog-meta]").textContent = `v${String(version).replace(/^v/i, "")} · ${asset.label || "Windows · 64 bits"}${asset.sizeBytes ? ` · ${formatBytes(asset.sizeBytes)}` : ""}`;
      action.href = url;
      action.setAttribute("download", asset.file || "");
      action.dataset.version = String(version);
      action.hidden = file.hidden = false;
      status.textContent = isWindows() ? "Todo listo. Pulsa el botón para descargar el instalador." : "Este instalador es para Windows. Puedes guardarlo para usarlo en un PC compatible.";
    } catch {
      if (id !== requestId || !dialog.open) return;
      status.textContent = "El instalador no está disponible en este momento. Vuelve a intentarlo en unos minutos.";
      retry.hidden = false;
    } finally {
      if (id === requestId) dialog.removeAttribute("aria-busy");
    }
  };
  $$("[data-download-cta]").forEach((trigger) => {
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      opener = trigger;
      if (!dialog.open) dialog.showModal();
      document.body.classList.add("download-dialog-open");
      prepare();
    });
  });
  $(".dialog-close", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener("close", () => {
    requestId++;
    dialog.removeAttribute("aria-busy");
    document.body.classList.remove("download-dialog-open");
    opener?.focus();
  });
  retry.addEventListener("click", () => { manifestRequest = null; prepare(); });
  action.addEventListener("click", () => {
    status.textContent = "Descarga solicitada. Revisa las descargas de tu navegador; si no comienza, puedes volver a pulsar el botón.";
  });
}

function setupYear() {
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
}

/* ---------- Arranque ---------- */

async function init() {
  setupTopbar();
  setupNavigation();
  setupAtmosphere();
  setupReveals();
  setupCopyHash();
  setupDownloadDialog();
  setupDownloadTracking();
  setupYear();

  const loaded = await getManifest();
  if (!loaded) return;
  const repo = loaded.data.repo || "https://github.com/";
  applyManifest(loaded.data, repo);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
