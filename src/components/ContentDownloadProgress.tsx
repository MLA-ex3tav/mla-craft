import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { contentInstallQueue } from "../lib/contentInstallQueue";

export default function ContentDownloadProgress({ id }: { id: string }) {
  const jobs = useSyncExternalStore(contentInstallQueue.subscribe, () => contentInstallQueue.snapshot(id));
  const active = jobs.find((job) => job.status === "installing");
  if (!active) return null;
  const waiting = jobs.filter((job) => job.status === "queued").length;
  return createPortal(<aside className="content-download-float" aria-label="Descarga de mods">
    <div><Loader2 size={16} className="animate-spin" /><span title={active.name}>{active.name}</span><strong>En curso</strong></div>
    <div className="content-download-track is-indeterminate" role="progressbar" aria-label={`Instalando ${active.name} y sus dependencias`} aria-valuetext="Instalación en curso"><span /></div>
    <small>{waiting ? `${waiting} en espera` : "Descargando e instalando sus dependencias…"}</small>
  </aside>, document.body);
}
