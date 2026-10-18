import { useEffect, useState } from "react";
import { Download, Loader2, LogOut, RefreshCw } from "lucide-react";
import { getAppInfo } from "../lib/api";
import { isDesktop, logoutRequest, openUrl } from "../lib/transport";
import {
  checkForUpdate,
  installUpdate,
  releasesUrl,
  restartForUpdate,
  unskipVersion,
  useUpdateState,
} from "../lib/updater";
import type { AppInfo } from "../lib/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="max-w-[60%] truncate text-sm" title={value}>
        {value}
      </span>
    </div>
  );
}

function UpdateCard() {
  const update = useUpdateState();
  const percent = Math.round(update.progress);
  const busy = update.status === "checking" || update.status === "downloading";

  const summary = (() => {
    switch (update.status) {
      case "checking":
        return "Buscando actualizaciones…";
      case "downloading":
        return `Descargando la versión ${update.version} · ${percent}%`;
      case "ready":
        return `Versión ${update.version} descargada. Reinicia para terminarla de aplicar.`;
      case "available":
        return `Versión ${update.version} disponible${update.currentVersion ? ` (tienes la ${update.currentVersion})` : ""}.`;
      case "current":
        return "Tienes la última versión publicada.";
      case "error":
        return update.error ?? "No se pudo comprobar si hay actualizaciones.";
      default:
        return isDesktop
          ? "Comprueba si hay una versión nueva publicada."
          : "Las actualizaciones se instalan desde la app de escritorio.";
    }
  })();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm">Actualizaciones</div>
          <div className={update.status === "error" ? "text-xs text-danger" : "text-xs text-muted"}>
            {summary}
          </div>
        </div>

        {update.status === "available" && update.skipped && (
          <button
            type="button"
            onClick={unskipVersion}
            className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-fg"
          >
            Mostrar aviso
          </button>
        )}

        {update.status === "available" && (
          <button
            type="button"
            onClick={() => void installUpdate()}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-bg hover:bg-accent-strong"
          >
            <Download size={14} />
            Actualizar
          </button>
        )}

        {update.status === "ready" && (
          <button
            type="button"
            onClick={() => void restartForUpdate()}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-bg hover:bg-accent-strong"
          >
            <RefreshCw size={14} />
            Reiniciar ahora
          </button>
        )}

        {isDesktop && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void checkForUpdate()}
            className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs text-muted hover:text-fg disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {update.status === "checking" ? "Buscando…" : "Buscar actualizaciones"}
          </button>
        )}

        <button
          type="button"
          onClick={() => void openUrl(releasesUrl())}
          className="rounded-lg px-2 py-2 text-xs text-muted underline decoration-border underline-offset-2 hover:text-fg"
        >
          Ver novedades
        </button>
      </div>

      {update.status === "downloading" && (
        <div className="px-4 pb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
          {update.total > 0 && (
            <p className="mt-1.5 text-[11px] text-muted">
              {(update.downloaded / 1024 / 1024).toFixed(1)} MB de {(update.total / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    getAppInfo().then(setInfo).catch(() => {});
  }, []);

  return (
    <div className="page-enter flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Ajustes</h1>
        <p className="text-xs text-muted">Información de la aplicación</p>
      </header>

      <div className="space-y-6 overflow-y-auto p-6">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <Row label="Nombre" value={info?.name ?? "—"} />
          <Row label="Versión" value={info?.version ?? "—"} />
          <Row label="Sistema" value={info ? `${info.os} / ${info.arch}` : "—"} />
          <Row label="Datos" value={info?.appDataDir ?? "—"} />
          {!isDesktop && <Row label="Panel" value={window.location.origin} />}
        </div>

        <UpdateCard />

        {!isDesktop && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
            <div>
              <div className="text-sm">Sesión</div>
              <div className="text-xs text-muted">
                Has entrado al panel web de MLA Server.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logoutRequest()}
              className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm text-danger hover:bg-danger/10"
            >
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
