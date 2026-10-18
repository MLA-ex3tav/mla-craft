import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { getAppInfo } from "../lib/api";
import { isDesktop, logoutRequest } from "../lib/transport";
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
