import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CornerLeftUp, Folder, FolderOpen, HardDrive, Loader2 } from "lucide-react";
import { invoke } from "../lib/transport";
import { folderSnapshot, resolveFolder, subscribeFolder } from "../lib/folderPicker";
import type { FsEntry } from "../lib/types";

function parentPath(path: string): string | null {
  if (!path) return null;
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (index <= 0) return null;
  return normalized.slice(0, index);
}

export default function FolderPicker() {
  const request = useSyncExternalStore(subscribeFolder, folderSnapshot);
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!request) return;
    setPath(request.startPath ?? "");
    setError("");
  }, [request]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setLoading(true);
    invoke<FsEntry[]>("browse_fs", { path: path || null })
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, request]);

  if (!request) return null;

  const up = parentPath(path);

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-6">
      <div className="flex h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <FolderOpen size={18} className="text-accent" />
          <h2 className="flex-1 text-sm font-semibold">Elegir carpeta del servidor</h2>
        </header>
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <code className="flex-1 truncate text-xs text-muted" title={path || "Equipos"}>
            {path || "Equipos"}
          </code>
          {up && (
            <button
              type="button"
              onClick={() => setPath(up)}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
            >
              <CornerLeftUp size={14} /> Subir
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-danger">{error}</p>
          ) : entries.length === 0 ? (
            <p className="p-4 text-sm text-muted">Carpeta vacía.</p>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                disabled={!entry.isDir}
                onClick={() => entry.isDir && setPath(entry.path)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                {entry.isDir ? (
                  /^[A-Z]:\\?$/.test(entry.name) ? (
                    <HardDrive size={16} className="text-muted" />
                  ) : (
                    <Folder size={16} className="text-muted" />
                  )
                ) : (
                  <Folder size={16} className="text-muted/40" />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            ))
          )}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {path ? `Seleccionada: ${path}` : "Entra en una carpeta"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => resolveFolder(null)}
              className="rounded-lg border border-border px-3.5 py-2 text-sm hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!path}
              onClick={() => resolveFolder(path)}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
            >
              Usar esta carpeta
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
