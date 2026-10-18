import { useSectionSearch } from "../lib/sectionSearch";
import ContentDownloadProgress from "./ContentDownloadProgress";
import ActionMenu from "./ActionMenu";
import { useEffect, useMemo, useState } from "react";
import { openFile, saveFile } from "../lib/transport";
import {
  Boxes,
  FileArchive,
  Search,
  FilePlus2,
  Loader2,
  PackagePlus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  addContentFile,
  exportMrpack,
  deleteContent,
  errorMessage,
  listContent,
  toggleContent,
} from "../lib/api";
import { useTaskProgress } from "../lib/useTaskProgress";
import type { ContentFile, Instance } from "../lib/types";
import { cx } from "../lib/cx";
import ContentBrowser, { type SourceOption } from "./ContentBrowser";

import { EmptyPanel } from "./SectionUI";

interface Props {
  instance: Instance;
  onBrowse?: () => void;
}

export function sourcesFor(instance: Instance): SourceOption[] {
  if (instance.type === "paper" || instance.type === "spigot") {
    return [
      { key: "modrinth", label: "Modrinth" },
      { key: "hangar", label: "Hangar" },
      { key: "spiget", label: "SpigotMC" },
    ];
  }
  if (
    instance.type === "fabric" ||
    instance.type === "neoforge" ||
    instance.type === "forge"
  ) {
    return [{ key: "modrinth", label: "Modrinth" }];
  }
  return [];
}

function ContentLogo({ file }: { file: ContentFile }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file.iconUrl]);
  return <span className="installed-content-logo">
    {file.iconUrl && !failed
      ? <img src={file.iconUrl} alt={`Logo de ${file.projectName || file.display}`} onError={() => setFailed(true)} />
      : <Boxes size={27} strokeWidth={1.5} aria-hidden="true" />}
  </span>;
}

function ContentTab({ instance, onBrowse }: Props) {
  const tasks = useTaskProgress();
  const sources = useMemo(() => sourcesFor(instance), [instance]);
  const isPlugin = instance.type === "paper" || instance.type === "spigot";
  const folderName = isPlugin ? "plugins" : "mods";

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const { query, setQuery, shared: sharedSearch } = useSectionSearch();
  const [files, setFiles] = useState<ContentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const visibleFiles = files.filter((file) => `${file.projectName ?? ""} ${file.display}`.toLowerCase().includes(query.toLowerCase()));

  const task = tasks[instance.id];
  const installing = task?.phase === "content" && task.percent < 100;

  async function refresh() {
    try {
      setFiles(await listContent(instance.id));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [instance.id]);

  async function addFile() {
    const selected = await openFile([{ name: "Plugin / Mod", extensions: ["jar"] }]);
    if (typeof selected !== "string") return;
    try {
      await addContentFile(instance.id, selected);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function exportPack() {
    if (exporting) return;
    setExporting(true);
    setExportMessage("");
    setError("");
    try {
      const filename = instance.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/, "") || "modpack";
      const selected = await saveFile(`${filename}.mrpack`);
      if (!selected) return;
      const path = selected.toLowerCase().endsWith(".mrpack") ? selected : `${selected}.mrpack`;
      const report = await exportMrpack(instance.id, path);
      setExportMessage(`Pack exportado: ${report.indexed} mods registrados en el manifiesto${report.bundled ? ` y ${report.bundled} archivos locales incluidos (pueden no aparecer en el contador del importador)` : ""}. ${path}`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setExporting(false); }
  }

  async function toggle(file: ContentFile) {
    setBusy(file.name);
    try {
      await toggleContent(instance.id, file.name);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(file: ContentFile) {
    setBusy(file.name);
    try {
      await deleteContent(instance.id, file.name);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (browsing) {
    return <ContentBrowser instance={instance} sources={sources} onClose={() => setBrowsing(false)} onInstalled={refresh} />;
  }

  if (instance.type === "vanilla") {
    return (
      <div className="inner-page page-enter"><div className="inner-list"><EmptyPanel icon={Boxes} title="La experiencia original de Minecraft" description="Vanilla no admite mods ni plugins. Crea un servidor Paper o Spigot para plugins, o Fabric, Forge o NeoForge para mods." /></div></div>
    );
  }

  return (
    <div className="inner-page page-enter space-y-5">
      
      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {exportMessage && <div role="status" className="discover-message break-all"><FileArchive size={17} />{exportMessage}</div>}

      <ContentDownloadProgress id={instance.id} />

      <div className="list-toolbar">
        <h2 className="text-sm font-semibold">
          Instalados ({files.length}) · {folderName}/
        </h2>
        <div className="content-toolbar-actions">
          {exporting && <span role="status" className="content-toolbar-status"><Loader2 size={14} className="animate-spin" />Exportando…</span>}
          <button type="button" onClick={() => onBrowse ? onBrowse() : setBrowsing(true)} className="toolbar-primary-action"><PackagePlus size={17} />{isPlugin ? "Añadir plugins" : "Añadir mods"}</button>
          <ActionMenu actions={[
            { label: "Añadir archivo .jar", icon: FilePlus2, run: addFile },
            { label: "Actualizar lista", icon: RefreshCw, run: refresh },
            ...(!isPlugin ? [{ label: exporting ? "Exportando…" : "Exportar .mrpack", icon: FileArchive, run: exportPack, disabled: exporting || installing || busy !== null || !files.some((file) => file.enabled) }] : []),
          ]} />
        </div>
      </div>

      {!sharedSearch && <label className="search-field"><Search size={16} /><input aria-label="Buscar contenido instalado" placeholder="Buscar entre tus archivos instalados…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>}
      <div className="installed-content-list section-card-grid">
        {loading ? (
          <div className="flex justify-center py-6 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : visibleFiles.length === 0 ? (
          <EmptyPanel icon={PackagePlus} title={query ? "No encontramos ese archivo" : "Dale algo nuevo a tu mundo"} description={query ? "Prueba con otro nombre de archivo." : "Explora el catálogo o añade un archivo .jar desde tu equipo para empezar."} />
        ) : (
          visibleFiles.map((file, index) => (
            <article key={file.name} className={cx("installed-content-row section-item-card", !file.enabled && "is-disabled")}
              style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }} aria-busy={busy === file.name}>
              <div className="section-card-top"><ContentLogo file={file} /><span className="section-card-tag">{isPlugin ? "Plugin" : "Mod"}</span></div>
              <div className="installed-content-info">
                <h3 title={file.projectName || file.display}>{file.projectName || file.display.replace(/\.jar$/i, "")}</h3>
                <p title={file.display}>{file.display}</p>
                <div className="installed-content-meta">
                  <span>{isPlugin ? "Plugin" : "Mod"}</span><span aria-hidden="true">·</span>
                  <span>{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</span>
                </div>
              </div>
              <footer className="section-card-footer">
              <span className="installed-content-status"><i />{file.enabled ? "Activado" : "Desactivado"}</span>
              <div className="installed-content-actions">
                <button type="button" role="switch" aria-checked={file.enabled}
                  aria-label={`${file.enabled ? "Desactivar" : "Activar"} ${file.projectName || file.display}`}
                  title={file.enabled ? "Desactivar" : "Activar"} disabled={busy !== null || exporting}
                  onClick={() => toggle(file)} className="installed-content-switch"><span /></button>
                <button type="button" aria-label={`Eliminar ${file.projectName || file.display}`}
                  title="Eliminar archivo" disabled={busy !== null || exporting} onClick={() => remove(file)} className="installed-content-delete">
                  {busy === file.name ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                </button>
              </div>
              </footer>
            </article>
          ))
        )}
      </div>


    </div>
  );
}

export default ContentTab;
