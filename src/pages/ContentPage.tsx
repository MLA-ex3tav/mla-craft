import Select from "../components/Select";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Boxes, Compass, PackageCheck, RefreshCw, Server } from "lucide-react";
import { errorMessage, listInstances } from "../lib/api";
import { SERVER_TYPE_LABELS, type Instance } from "../lib/types";
import ContentTab, { sourcesFor } from "../components/ContentTab";
import ContentBrowser from "../components/ContentBrowser";
import { EmptyPanel } from "../components/SectionUI";

export default function ContentPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<"explore" | "installed">("explore");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listInstances().then((list) => {
      if (cancelled) return;
      setInstances(list);
      setSelectedId((previous) => list.some((item) => item.id === previous) ? previous : (list.find((item) => item.type !== "vanilla" && item.installed) ?? list.find((item) => item.type !== "vanilla") ?? list[0])?.id ?? "");
    }).catch((e) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const selected = instances.find((item) => item.id === selectedId);
  const supported = selected && selected.type !== "vanilla" && selected.installed;

  return <div data-server-context={selected?.id} className="flex h-full min-h-0 flex-col">
    <header className="content-hub-header"><div><h1>Contenido</h1><p className="text-muted">Un lugar para descubrir y gestionar los mods y plugins de tus servidores.</p></div><span className="content-hub-icon" aria-hidden="true"><Boxes size={24} strokeWidth={1.6} /></span></header>
    {loading ? <div className="p-7" role="status" aria-label="Cargando servidores"><div className="skeleton" /></div> : error ? <div className="m-7 rounded-xl border border-danger/30 bg-surface p-6"><p role="alert" className="text-sm text-danger">{error}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="mt-4 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"><RefreshCw size={15} /> Reintentar</button></div> : !selected ? <div className="inner-page"><div className="inner-list"><EmptyPanel icon={Boxes} title="Elige un mundo para empezar" description="Crea un servidor para explorar su catálogo e instalar mods o plugins. Paper y Spigot admiten plugins; Fabric, Forge y NeoForge admiten mods." /><div className="flex justify-center pb-8"><Link to="/" className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm text-white">Ir a servidores <ArrowUpRight size={16} /></Link></div></div></div> : <>
      <div className="content-destination">
        <span className="row-icon" aria-hidden="true"><Server size={21} /></span>
        <label className="content-server-select"><span>Gestionar contenido de</span><Select value={selectedId} onChange={(value) => setSelectedId(value)}>{instances.map((item) => <option key={item.id} value={item.id}>{item.name} · {SERVER_TYPE_LABELS[item.type]} · MC {item.mcVersion}</option>)}</Select></label>
        <Link className="content-server-link" to={`/server/${selected.id}`}>Abrir servidor <ArrowUpRight size={15} /></Link>
      </div>
      {supported ? <>
        <nav className="content-view-tabs" aria-label="Vista de contenido"><button type="button" aria-pressed={view === "explore"} onClick={() => setView("explore")}><Compass size={17} /> Explorar catálogo</button><button type="button" aria-pressed={view === "installed"} onClick={() => setView("installed")}><PackageCheck size={17} /> Instalados</button></nav>
        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "explore" ? <ContentBrowser key={selected.id} instance={selected} sources={sourcesFor(selected)} onClose={() => setView("installed")} onInstalled={() => { /* Installed content is freshly loaded when its tab opens. */ }} /> : <ContentTab key={selected.id} instance={selected} onBrowse={() => setView("explore")} />}
        </div>
      </> : <div className="inner-page"><div className="inner-list"><EmptyPanel icon={Boxes} title={selected.type === "vanilla" ? "Vanilla conserva la experiencia original" : "Primero, instala este servidor"} description={selected.type === "vanilla" ? "Este tipo no admite mods ni plugins. Selecciona un servidor Paper, Spigot, Fabric, Forge o NeoForge para gestionar su contenido." : "Abre el servidor y completa la instalación. Después podrás explorar el catálogo y añadir contenido desde aquí."} /><div className="flex justify-center pb-8"><Link className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm text-white" to={selected.type === "vanilla" ? "/" : `/server/${selected.id}`}>{selected.type === "vanilla" ? "Ver servidores" : "Configurar servidor"}<ArrowUpRight size={16} /></Link></div></div></div>}
    </>}
  </div>;
}
