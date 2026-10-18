import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { isDesktop, openUrl } from "../lib/transport";
import {
  installUpdate,
  releasesUrl,
  restartForUpdate,
  skipVersion,
  useUpdateState,
} from "../lib/updater";

/**
 * Aviso compacto de actualización disponible. Vive sobre el contenido del
 * workspace y solo aparece cuando hay algo que hacer.
 */
export default function UpdateBanner() {
  const update = useUpdateState();
  const [hidden, setHidden] = useState(false);

  // Si el usuario decide actualizar, el aviso vuelve aunque lo haya cerrado.
  useEffect(() => {
    if (update.status === "downloading" || update.status === "ready") setHidden(false);
  }, [update.status]);

  if (!isDesktop || hidden || update.skipped) return null;
  if (update.status !== "available" && update.status !== "downloading" && update.status !== "ready") {
    return null;
  }

  const percent = Math.round(update.progress);

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-accent/30 bg-accent-soft px-6 py-3 text-sm text-accent"
      role="status"
      aria-live="polite"
    >
      {update.status === "available" && (
        <>
          <RefreshCw size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">Versión {update.version} disponible.</strong>{" "}
            <span className="text-accent/80">
              {update.currentVersion ? `Tienes la ${update.currentVersion}.` : "Puedes actualizar ahora."}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void openUrl(releasesUrl())}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            Ver novedades
          </button>
          <button
            type="button"
            onClick={() => void installUpdate()}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-bg hover:bg-accent-strong"
          >
            <Download size={14} />
            Actualizar
          </button>
          <button
            type="button"
            aria-label="Ocultar hasta la próxima versión"
            title="Ocultar hasta la próxima versión"
            onClick={() => { skipVersion(); setHidden(true); }}
            className="rounded-lg p-1.5 text-accent/70 hover:bg-accent/10 hover:text-accent"
          >
            <X size={15} />
          </button>
        </>
      )}

      {update.status === "downloading" && (
        <>
          <Loader2 size={16} className="shrink-0 animate-spin" />
          <span className="shrink-0 font-medium">
            Descargando la {update.version}
            {update.total > 0 ? ` · ${percent}%` : "…"}
          </span>
          <span className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-accent/20" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </span>
          <span className="shrink-0 text-xs text-accent/80">No cierres la app</span>
        </>
      )}

      {update.status === "ready" && (
        <>
          <RefreshCw size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">Actualización lista.</strong>{" "}
            <span className="text-accent/80">Reinicia para terminar.</span>
          </span>
          <button
            type="button"
            onClick={() => void restartForUpdate()}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-bg hover:bg-accent-strong"
          >
            <RefreshCw size={14} />
            Reiniciar ahora
          </button>
        </>
      )}
    </div>
  );
}
