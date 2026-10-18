import ServerModeBadge from "../components/ServerModeBadge";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RemoveServerDialog from "../components/RemoveServerDialog";
import { openPath } from "../lib/transport";
import { ArrowUpRight, Box, Boxes, Check, Download, FolderOpen, Hash, Cpu, Leaf, Loader2, Network, Plus, Server, Trash2 } from "lucide-react";
import {
  errorMessage,
  installServer,
  listInstances,
} from "../lib/api";
import { useTaskProgress } from "../lib/useTaskProgress";
import { SERVER_TYPE_LABELS, type Instance } from "../lib/types";
import { cx } from "../lib/cx";
import { useServerMenu } from "../components/ServerMenu";
import MinecraftBlock from "../components/MinecraftBlock";
import NewServerDialog from "../components/NewServerDialog";

const PHASE_LABEL: Record<string, string> = {
  resolve: "Resolviendo",
  java: "Instalando Java",
  download: "Descargando",
  configure: "Configurando",
  done: "Completado",
};

function TypeBadge({ type }: { type: Instance["type"] }) {
  return (
    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent ring-1 ring-accent/30">
      {SERVER_TYPE_LABELS[type]}
    </span>
  );
}

function ServerDetail({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return <div className="server-detail"><dt><Icon size={14} strokeWidth={1.8} />{label}</dt><dd title={value}>{value}</dd></div>;
}

function ServersPage() {
  const openMenu = useServerMenu();
  const tasks = useTaskProgress();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [removing, setRemoving] = useState<Instance | null>(null);

  async function refresh() {
    try {
      setInstances(await listInstances());
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    window.addEventListener("mla-instances-changed", refresh);
    return () => window.removeEventListener("mla-instances-changed", refresh);
  }, []);

  async function install(instance: Instance) {
    setError("");
    setBusy((prev) => new Set(prev).add(instance.id));
    try {
      const updated = await installServer(instance.id);
      setInstances((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i)),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(instance.id);
        return next;
      });
    }
  }

  function remove(instance: Instance) { setRemoving(instance); }

  return (
    <div className="page-enter flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Servidores</h1>
          <p className="text-xs text-muted">
            Tus mundos de Minecraft, en un solo lugar
          </p>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="servers-body">
      <div className="collection-heading">
        <h2>Tu colección</h2>
        <span className="collection-count">{loading ? "Cargando…" : `${instances.length} ${instances.length === 1 ? "servidor" : "servidores"}`}</span>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="status" aria-label="Cargando servidores">
          <div className="skeleton" /><div className="skeleton" />
        </div>
      ) : instances.length === 0 ? (
        <>
          <div className="empty-state">
            <div className="world-illustration" aria-hidden="true">
              <div className="world-orbit" />
              <div className="world-icon"><Box size={44} strokeWidth={1.4} /></div>
              <div className="world-spark"><Leaf size={18} /></div>
            </div>
            <h2>Tu próximo mundo empieza aquí</h2>
            <p>Crea tu primer servidor, elige tu versión de Minecraft y prepara un lugar para tu próxima aventura.</p>
            <button type="button" onClick={() => setShowNew(true)} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold">
              <Plus size={18} /> Crear mi primer servidor <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="setup-hints">
            <span><Check size={15} /> Java automático</span>
            <span><Box size={15} /> Mods y plugins</span>
            <span><Server size={15} /> Todo bajo tu control</span>
          </div>
        </>
      ) : (
        <div className="servers-collection-grid">
          {instances.map((instance) => {
            const task = tasks[instance.id];
            const isBusy = busy.has(instance.id);
            const active = isBusy || (!!task && task.phase !== "content" && task.phase !== "done" && (task.percent ?? 0) < 100);
            return (
              <article
                key={instance.id}
                onContextMenu={(event) => { event.preventDefault(); openMenu(instance, event.clientX, event.clientY); }}
                className="server-card server-card-refined"
              >
                <div className="server-card-heading">
                  <div className="server-card-emblem" aria-hidden="true"><MinecraftBlock type={instance.type} /></div>
                  <div className="server-card-identity">
                    <TypeBadge type={instance.type} /> <ServerModeBadge enabled={instance.mcsrCoop} />
                    <h3><Link className="server-title-link" to={`/server/${instance.id}`} title={instance.name}>{instance.name}</Link></h3>
                  </div>
                  <ArrowUpRight className="server-card-arrow" size={20} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <p className="server-card-path" title={instance.dir}><FolderOpen size={13} /><span>{instance.dir}</span></p>
                <dl className="server-card-details">
                  <ServerDetail icon={Boxes} label="Minecraft" value={instance.mcVersion} />
                  <ServerDetail icon={Network} label="Puerto" value={String(instance.port)} />
                  <ServerDetail icon={Cpu} label="Memoria máx." value={`${(instance.memoryMaxMb / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} GB`} />
                </dl>
                {instance.build != null && <span className="server-build"><Hash size={12} /> Build {instance.build}</span>}

                {active && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted">
                      <span>{PHASE_LABEL[task?.phase ?? ""] ?? "Instalando"}</span>
                      <span title="Avance estimado de la instalación por etapas">{Math.round(task?.percent ?? 0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${task?.percent ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="server-card-footer">
                  <div className="server-card-actions">
                  {!instance.installed && (
                    <button
                      type="button"
                      disabled={active}
                      onClick={(e) => {
                        e.stopPropagation();
                        install(instance);
                      }}
                      className={cx(
                        "server-install-button flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-bg hover:bg-accent-strong",
                        active && "opacity-60",
                      )}
                    >
                      {active ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      {active ? "Instalando…" : "Instalar"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Abrir carpeta de ${instance.name}`}
                    title="Abrir carpeta"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPath(instance.dir).catch((e) => setError(errorMessage(e)));
                    }}
                    className="flex items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-fg"
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar ${instance.name}`}
                    title="Quitar servidor"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(instance);
                    }}
                    className="flex items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:border-danger/50 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                  </div>
                </div>
              </article>
            );
          })}
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="server-add-button"
            aria-label="Crear nuevo servidor"
            title="Crear nuevo servidor"
          >
            <Plus size={26} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      )}

      </div>

      {removing && <RemoveServerDialog instance={removing} onClose={() => setRemoving(null)} onRemoved={() => { setInstances((prev) => prev.filter((item) => item.id !== removing.id)); setRemoving(null); }} />}
      {showNew && (
        <NewServerDialog
          onClose={() => setShowNew(false)}
          onCreated={(instance) => {
            setInstances((prev) =>
              prev.some((item) => item.id === instance.id)
                ? prev.map((item) => (item.id === instance.id ? instance : item))
                : [...prev, instance],
            );
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

export default ServersPage;
