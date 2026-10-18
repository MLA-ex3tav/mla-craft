import { useSectionSearch } from "../lib/sectionSearch";
import ContentDownloadProgress from "./ContentDownloadProgress";
import Select from "./Select";
import { contentInstallQueue } from "../lib/contentInstallQueue";
import CategoryDrawer from "./CategoryDrawer";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Download, Loader2, Search, Package, Check, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  errorMessage,
  installedContentIds,
  listContentCategories,
  searchContent,
} from "../lib/api";
import type { ContentCategory, ContentProject, Instance } from "../lib/types";
import { cx } from "../lib/cx";
import { EmptyPanel } from "./SectionUI";

export interface SourceOption {
  key: string;
  label: string;
}

interface Props {
  instance: Instance;
  sources: SourceOption[];
  onClose: () => void;
  onInstalled: () => void;
}

const SORTS = [
  { key: "downloads", label: "Más descargados" },
  { key: "relevance", label: "Relevancia" },
  { key: "updated", label: "Actualizados" },
  { key: "newest", label: "Más nuevos" },
];

function ContentBrowser({ instance, sources, onClose, onInstalled }: Props) {
  const requestId = useRef(0);
  const firstLoad = useRef(true);
  const resultsHeading = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const jobs = useSyncExternalStore(contentInstallQueue.subscribe, () => contentInstallQueue.snapshot(instance.id));
  const completed = jobs.filter((job) => job.status === "installed").length;
  const waiting = jobs.filter((job) => job.status === "queued").length;
  const activeJob = jobs.find((job) => job.status === "installing");
  const onInstalledRef = useRef(onInstalled);
  onInstalledRef.current = onInstalled;
  useEffect(() => { if (completed > 0) onInstalledRef.current(); }, [completed, instance.id]);
  const isPlugin = instance.type === "paper" || instance.type === "spigot";
  const [source, setSource] = useState(sources[0]?.key ?? "modrinth");
  const { query, setQuery, shared: sharedSearch } = useSectionSearch();
  const [showCategories, setShowCategories] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState("downloads");
  const [results, setResults] = useState<ContentProject[]>([]);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [installedOnDisk, setInstalledOnDisk] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    installedContentIds(instance.id)
      .then((ids) => { if (!cancelled) setInstalledOnDisk(new Set(ids)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [instance.id, completed]);


  async function run(
    src: string,
    q: string,
    cat: string | null,
    srt: string,
    targetPage: number,
  ) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const list = await searchContent(instance.id, src, {
        query: q,
        category: cat ?? undefined,
        sort: srt,
        page: targetPage,
      });
      if (currentRequest === requestId.current) {
        setResults(list.projects);
        setTotal(list.total);
        setHasMore(list.hasMore);
      }
    } catch (e) {
      if (currentRequest === requestId.current) { setError(errorMessage(e)); setResults([]); setHasMore(false); setTotal(null); }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setCategory(null);
    setPage(0);
    setCategories([]);
    listContentCategories(instance.id, source)
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [source, instance.id]);

  const previousQuery = useRef(query);
  useEffect(() => {
    if (previousQuery.current !== query) { previousQuery.current = query; if (page !== 0) { setPage(0); return; } }
    const delay = firstLoad.current ? 0 : 320;
    firstLoad.current = false;
    setLoading(true);
    const handle = setTimeout(() => {
      run(source, query, category, sort, page);
    }, delay);
    return () => { clearTimeout(handle); ++requestId.current; };
  }, [source, query, category, sort, page, instance.id]);

  function pickCategory(id: string | null) {
    setCategory(id);
    setPage(0);
  }

  const pageCount = total === null ? page + 1 + Number(hasMore) : Math.max(1, Math.ceil(total / 20));
  const pageNumbers = Array.from(new Set([0, ...Array.from({ length: 5 }, (_, i) => page - 2 + i), pageCount - 1]))
    .filter((value) => value >= 0 && value < pageCount).sort((a, b) => a - b);

  function goToPage(next: number) {
    if (loading || next === page) return;
    setPage(next);
    resultsHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    resultsHeading.current?.focus({ preventScroll: true });
  }

  function install(project: ContentProject) {
    contentInstallQueue.enqueue(instance.id, project);
  }

  return (
    <section className="discover-page" aria-label={isPlugin ? "Catálogo de plugins" : "Catálogo de mods"}>
      <ContentDownloadProgress id={instance.id} />
      <header className="discover-header">
        <button type="button" onClick={onClose} className="discover-back"><ArrowLeft size={17} /> Volver a instalados</button>
        <span className="discover-context">{instance.name} <span>· Minecraft {instance.mcVersion}</span></span>
      </header>
      <div className="discover-scroll">
        {!sharedSearch && <form className="discover-search" onSubmit={(event) => { event.preventDefault(); page === 0 ? run(source, query, category, sort, 0) : setPage(0); }}>
          <Search size={22} /><input aria-label="Buscar mods y plugins" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={isPlugin ? "¿Qué quieres añadir? Busca un plugin…" : "¿Qué quieres añadir? Busca un mod…"} />
          {query && <button type="button" aria-label="Limpiar búsqueda" className="clear-query" onClick={() => { setQuery(""); setPage(0); }}><X size={17} /></button>}
          <button type="submit" className="bg-accent discover-search-button">Buscar</button>
        </form>}
        <div className="discover-filters">
          <div className="catalog-providers" aria-label="Fuente del contenido">{sources.length === 1 ? <span className="catalog-provider-label"><Package size={14} /> Catálogo de {sources[0].label}</span> : <div className="catalog-provider-tabs">{sources.map((item) => <button key={item.key} type="button" aria-pressed={source === item.key} onClick={() => { setSource(item.key); setCategory(null); setPage(0); }}>{item.label}</button>)}</div>}</div>
          <button type="button" className="category-drawer-trigger" aria-haspopup="dialog" aria-expanded={showCategories} onClick={() => setShowCategories(true)}><SlidersHorizontal size={16} /><span>{categories.find((item) => item.id === category)?.name ?? "Categorías"}</span>{category && <span className="category-filter-dot" />}</button>
          <label><Select aria-label="Ordenar resultados" value={sort} onChange={(value) => { setSort(value); setPage(0); }}>{SORTS.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></label>
        </div>
        <div role="status" aria-live="polite" className="catalog-install-status">
          {activeJob ? <><Loader2 size={17} className="animate-spin" /><span title={`Instalando ${activeJob.name}`}>Instalando {activeJob.name}</span>{waiting > 0 && <small>{waiting} en espera</small>}</> : <><Check size={17} /><span>{completed > 0 ? "Instalaciones completadas" : "Selecciona los mods que quieras añadir"}</span></>}
        </div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>}
        <div ref={resultsHeading} tabIndex={-1} className="discover-results-heading"><h3>{category ? categories.find((item) => item.id === category)?.name ?? "Explorar contenido" : "Explora el catálogo"}</h3><span>{loading ? "Buscando…" : total !== null ? `${total.toLocaleString("es")} resultados · Página ${page + 1}` : `${results.length} resultados · Página ${page + 1}`}</span></div>
        {loading ? <div className="discover-grid" role="status" aria-label="Cargando catálogo">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}</div> : results.length === 0 ? <div className="inner-list"><EmptyPanel icon={Search} title={error ? "No pudimos cargar el catálogo" : "No encontramos coincidencias"} description={error ? "Vuelve a buscar para reintentar la conexión." : "Prueba con otro nombre, cambia de fuente o selecciona otra categoría."} /></div> :
          <div className="discover-grid">{results.map((project) => {
            const identity = `${project.source}:${project.id}`;
            const job = jobs.find((item) => item.key === identity);
            const installed = job?.status === "installed" || installedOnDisk.has(identity);
            const installing = job?.status === "installing";
            const queued = job?.status === "queued";
            return <article className="discover-project" key={identity}>
              <div className="discover-project-top">{project.iconUrl ? <img src={project.iconUrl} alt="" loading="lazy" /> : <span className="discover-project-icon"><Package size={28} /></span>}<span className="project-source">{sources.find((item) => item.key === project.source)?.label ?? project.source}</span></div>
              <h4 title={project.name}>{project.name}</h4><p className={job?.status === "error" ? "catalog-project-description has-error" : "catalog-project-description"} role={job?.status === "error" ? "alert" : undefined} title={job?.status === "error" ? job.error : project.description}>{job?.status === "error" ? job.error : project.description}</p>
              <footer><span title={`${project.downloads.toLocaleString()} descargas`}><Download size={14} />{new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 }).format(project.downloads)}</span><button type="button" aria-label={`${installed ? "Instalado" : queued ? "En espera" : job?.status === "error" ? "Reintentar" : "Instalar"} ${project.name}`} disabled={installing || queued || installed} onClick={() => install(project)} className={cx("project-install", installed && "installed")}>{installing ? <Loader2 size={15} className="animate-spin" /> : installed ? <Check size={15} /> : <Download size={15} />}{installing ? "Instalando…" : installed ? "Instalado" : queued ? "En espera" : job?.status === "error" ? "Reintentar" : "Instalar"}</button></footer>
            </article>;
          })}</div>}
        {(results.length > 0 || page > 0 || loading) && <nav className="catalog-pagination" aria-label="Páginas del catálogo">
          <span className="catalog-page-summary" role="status">{loading ? "Cargando resultados…" : results.length > 0 ? `${page * 20 + 1}–${page * 20 + results.length}${total !== null ? ` de ${total.toLocaleString("es")}` : " resultados"}` : "Sin resultados en esta página"}</span>
          <div className="catalog-page-controls">
            <button type="button" disabled={loading || page === 0} onClick={() => goToPage(page - 1)}><ChevronLeft size={16} /><span>Anterior</span></button>
            {pageNumbers.map((number, index) => <span className="catalog-page-item" key={number}>
              {index > 0 && number - pageNumbers[index - 1] > 1 && <span className="catalog-page-gap">…</span>}
              <button type="button" className="catalog-page-number" aria-label={`Página ${number + 1}`} aria-current={number === page ? "page" : undefined} disabled={loading} onClick={() => goToPage(number)}>{number + 1}</button>
            </span>)}
            <button type="button" disabled={loading || !hasMore} onClick={() => goToPage(page + 1)}><span>Siguiente</span><ChevronRight size={16} /></button>
          </div>
        </nav>}
      </div>
      {showCategories && <CategoryDrawer categories={categories} selected={category} onSelect={pickCategory} onClose={() => setShowCategories(false)} />}
    </section>
  );
}
export default ContentBrowser;
