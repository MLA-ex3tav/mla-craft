// Only installer URLs can become download actions; release pages are not files.
export function installerUrl(value, base) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value, base);
    const local = url.origin === new URL(base).origin;
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (url.username || url.password || !/\.(exe|msi)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function githubReleaseEndpoint(repo) {
  try {
    const url = new URL(repo);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length !== 2 || !parts.every((part) => /^[\w.-]+$/.test(part))) return null;
    return `https://api.github.com/repos/${parts.join("/")}/releases/latest`;
  } catch { return null; }
}

export function pickWindowsInstaller(assets = []) {
  return assets.find((asset) => /(?:x64|amd64).*setup\.exe$/i.test(asset.name))
    ?? assets.find((asset) => /(?:x64|amd64).*\.msi$/i.test(asset.name))
    ?? assets.find((asset) => /setup\.exe$/i.test(asset.name) && !/(arm64|aarch64|ia32|x86)/i.test(asset.name));
}
