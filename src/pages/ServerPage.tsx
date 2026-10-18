import ServerModeBadge from "../components/ServerModeBadge";
import { SectionSearchContext, matchesSearch } from "../lib/sectionSearch";
import ServerConnections from "../components/ServerConnections";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { openUrl, listen } from "../lib/transport";
import {
  Archive,
  ArrowLeft,
  Boxes,
  Download,
  Loader2,
  LayoutGrid,
  List,
  Network,
  Search,
  X,
  Play,
  Settings2,
  SlidersHorizontal,
  Square,
  Terminal,
  Users,
  RotateCw,
} from "lucide-react";
import {
  errorMessage,
  getEula,
  getInstance,
  installServer,
  restartServer,
  serverStatus,
  setEula,
  startServer,
  stopServer,
} from "../lib/api";
import { useTaskProgress } from "../lib/useTaskProgress";
import {
  SERVER_TYPE_LABELS,
  type Instance,
  type ServerState,
  type StateChange,
} from "../lib/types";
import { cx } from "../lib/cx";
import Console from "../components/Console";
import ContentTab from "../components/ContentTab";
import PlayersTab from "../components/PlayersTab";
import BackupsTab from "../components/BackupsTab";
import ServerSettings from "../components/ServerSettings";

type Tab = "console" | "players" | "content" | "backups" | "settings" | "rules" | "connection";

function ServerPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const tasks = useTaskProgress();

  const [instance, setInstance] = useState<Instance | null>(null);
  const [eula, setEulaState] = useState(false);
  const [state, setState] = useState<ServerState>("stopped");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [controlAction, setControlAction] = useState<"start" | "stop" | "restart" | null>(null);
  const controlLock = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [layout, setLayout] = useState<"cards" | "list">(() => {
    try { return localStorage.getItem("mla-server-layout") === "list" ? "list" : "cards"; }
    catch { return "cards"; }
  });
  function changeLayout(next: "cards" | "list") {
    setLayout(next);
    try { localStorage.setItem("mla-server-layout", next); } catch { /* The view still works when storage is unavailable. */ }
  }
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [searches, setSearches] = useState<Record<string, string>>({});
  const requestedTab = searchParams.get("tab");
  const defaultTab: Tab = state === "running" || state === "starting" || instance?.type === "vanilla" ? "console" : "content";
  const tab: Tab = ["console", "players", "content", "backups", "settings", "rules", "connection"].includes(requestedTab ?? "") ? requestedTab as Tab : defaultTab;
  const query = searches[`${id}:${tab}`] ?? "";
  const setQuery = (value: string) => setSearches((prev) => ({ ...prev, [`${id}:${tab}`]: value }));
  function setTab(next: Tab) { setSearchParams({ tab: next }, { replace: true }); }
  const [showEula, setShowEula] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getInstance(id), getEula(id), serverStatus(id)])
      .then(([inst, accepted, running]) => {
        if (cancelled) return;
        setInstance(inst);
        setEulaState(accepted);
        setState(running ? "running" : "stopped");
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<StateChange>("server-state", (change) => {
      if (disposed || change.id !== id) return;
      setState(change.state);
      if (change.state === "starting") {
        setSearchParams({ tab: "console" }, { replace: true });
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => { disposed = true; unlisten?.(); };
  }, [id, setSearchParams]);

  const installDoneRef = useRef(false);
  useEffect(() => {
    const t = tasks[id];
    const done = t?.phase === "done" && (t.percent ?? 0) >= 100;
    if (done && !installDoneRef.current) {
      installDoneRef.current = true;
      getInstance(id).then(setInstance).catch(() => {});
    } else if (!done) {
      installDoneRef.current = false;
    }
  }, [tasks, id]);

  async function install() {
    if (!instance) return;
    setBusy(true);
    setError("");
    try {
      setInstance(await installServer(instance.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runControl(action: "start" | "stop" | "restart") {
    if (!instance || controlLock.current) return;
    controlLock.current = true;
    setControlAction(action);
    if (action === "start" || action === "restart") setTab("console");
    setError("");
    setState(action === "start" ? "starting" : "stopping");
    try {
      if (action === "start") await startServer(instance.id);
      else if (action === "stop") await stopServer(instance.id);
      else await restartServer(instance.id);
    } catch (e) {
      setError(errorMessage(e));
      try { setState(await serverStatus(instance.id) ? "running" : "stopped"); } catch { /* Keep the last known transition. */ }
    } finally {
      controlLock.current = false;
      setControlAction(null);
    }
  }

  async function startServerNow() { await runControl("start"); }

  function start() {
    if (!instance) return;
    if (!eula) {
      setShowEula(true);
      return;
    }
    startServerNow();
  }

  async function acceptEulaAndStart() {
    setShowEula(false);
    await toggleEula(true);
    await startServerNow();
  }

  async function toggleEula(value: boolean) {
    if (!instance) return;
    setEulaState(value);
    try {
      await setEula(instance.id, value);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <p className="text-sm">{error || "Servidor no encontrado."}</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
        >
          Volver
        </button>
      </div>
    );
  }

  const running = state === "running" || state === "starting";
  const task = tasks[instance.id];
  const installInProgress =
    busy || (!!task && task.phase !== "content" && task.phase !== "done" && (task.percent ?? 0) < 100);

  return (
    <div className="page-enter flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-lg border border-border p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{instance.name}</h1>
          <p className="truncate text-xs text-muted">
            {SERVER_TYPE_LABELS[instance.type]} · MC {instance.mcVersion}
            {instance.build != null ? ` · build #${instance.build}` : ""} <ServerModeBadge enabled={instance.mcsrCoop} />
          </p>
        </div>

        {!instance.installed ? (
          <button
            type="button"
            disabled={installInProgress}
            onClick={install}
            className={cx(
              "flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-bg hover:bg-accent-strong",
              installInProgress && "opacity-60",
            )}
          >
            {installInProgress ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            {installInProgress ? "Instalando…" : "Instalar"}
          </button>
        ) : (
          <div className="server-primary-controls" aria-label="Control del servidor">
            <button type="button" onClick={() => state === "running" ? runControl("stop") : start()} disabled={controlAction !== null || state === "starting" || state === "stopping"}
              className={cx("server-power-button", state === "running" && "is-stop")}>
              {controlAction !== null || state === "starting" || state === "stopping" ? <Loader2 size={19} className="animate-spin" /> : state === "running" ? <Square size={18} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
              {controlAction === "restart" ? "Reiniciando…" : state === "starting" ? "Iniciando…" : state === "stopping" ? "Deteniendo…" : state === "running" ? "Detener" : "Iniciar"}
            </button>
            <button type="button" onClick={() => runControl("restart")} disabled={controlAction !== null || state !== "running"} className="server-restart-button" title={state === "running" ? "Detener y volver a iniciar el servidor" : "Disponible cuando el servidor esté encendido"}>
              <RotateCw size={18} className={controlAction === "restart" ? "animate-spin" : ""} />Reiniciar
            </button>
          </div>
        )}
      </header>

      {installInProgress && task && task.phase !== "content" && (task.percent ?? 0) < 100 && (
        <div className="border-b border-border px-6 py-2">
          <div className="flex justify-between text-[11px] text-muted">
            <span>{task.message ?? task.phase}</span>
            <span title="Avance estimado de la instalación por etapas">{Math.round(task.percent)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${task.percent}%` }}
            />
          </div>
        </div>
      )}

      {installInProgress && !task && (
        <div className="border-b border-border px-6 py-2">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <Loader2 size={13} className="animate-spin" /> Instalando…
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="server-tabs flex gap-1 border-b border-border px-6">
        {(
          [
            { key: "content", label: "Mods / Plugins", icon: Boxes },
            { key: "console", label: "Consola", icon: Terminal },
            { key: "connection", label: "Conexión", icon: Network },
            { key: "players", label: "Jugadores", icon: Users },
            { key: "backups", label: "Backups", icon: Archive },
            { key: "rules", label: "Reglas del mundo", icon: SlidersHorizontal },
            { key: "settings", label: "Ajustes", icon: Settings2 },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm",
              tab === key
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className={cx("server-section-toolbar", tab === "players" && "has-section-navigation")}>
      {tab === "players" && <div ref={setToolbarTarget} className="server-section-navigation" />}
      <div className="server-section-search"><Search size={18} /><input type="search" aria-label="Buscar en esta sección" placeholder={tab === "console" ? "Buscar en el registro de la consola…" : "Buscar en esta sección…"} value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={17} /></button>}</div>
      {tab !== "console" && tab !== "rules" && <div className="section-layout-toggle" role="group" aria-label="Vista de las secciones">
        <button type="button" aria-pressed={layout === "cards"} title="Vista de tarjetas" onClick={() => changeLayout("cards")}><LayoutGrid size={17} /><span>Tarjetas</span></button>
        <button type="button" aria-pressed={layout === "list"} title="Vista de lista" onClick={() => changeLayout("list")}><List size={18} /><span>Lista</span></button>
      </div>}
      </div>
      <SectionSearchContext.Provider value={{ query, setQuery, toolbarTarget }}>
      <div className="min-h-0 flex-1 overflow-hidden" data-section-layout={tab === "rules" ? "list" : layout}>
        {tab === "console" && (
          instance.installed ? (
            <Console id={instance.id} running={running} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
              <Terminal size={36} strokeWidth={1.4} />
              <p className="text-sm">Instala el servidor para empezar.</p>
            </div>
          )
        )}
        {tab === "connection" && <ServerConnections id={instance.id} port={instance.port} />}
        {tab === "players" && <PlayersTab instance={instance} />}
        {tab === "content" && <ContentTab instance={instance} />}
        {tab === "backups" && (
          <BackupsTab instance={instance} onUpdated={setInstance} />
        )}
        <div hidden={tab !== "rules"} className="settings-tab-pane">
          <div className="inner-page space-y-6">
            <ServerSettings key={`${instance.id}-rules`} instance={instance} onUpdated={setInstance} mode="rules" />
          </div>
        </div>
        <div hidden={tab !== "settings"} className="settings-tab-pane">
          <div className="inner-page space-y-6">
            
            <ServerSettings key={`${instance.id}-resources`} instance={instance} onUpdated={setInstance} mode="resources" />
            <div hidden={!matchesSearch("Aceptar EULA de Minecraft", query)} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm">Aceptar EULA de Minecraft</div>
                  <div className="text-xs text-muted">
                    Necesario para arrancar el servidor.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={eula}
                  onChange={(e) => toggleEula(e.target.checked)}
                  disabled={!instance.installed}
                  aria-label="Aceptar EULA de Minecraft"
                  role="switch"
                  className="setting-switch disabled:opacity-40"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              {[
                ["Carpeta", instance.dir],
                ["Java", instance.javaPath ?? "Por determinar"],
              ].filter(([label, value]) => matchesSearch(`${label} ${value}`, query)).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
                >
                  <span className="text-sm text-muted">{label}</span>
                  <span className="max-w-[65%] truncate text-sm" title={value}>
                    {value}
                  </span>
                </div>
              ))}
            </div>


          </div>
        </div>
      </div>

      </SectionSearchContext.Provider>
      {showEula && (
        <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center p-6">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <header className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">
                Aceptar el EULA de Minecraft
              </h2>
            </header>
            <div className="space-y-3 p-5 text-sm text-muted">
              <p>
                Para arrancar un servidor de Minecraft debes aceptar el Contrato
                de Licencia de Usuario Final (EULA) de Mojang.
              </p>
              <button
                type="button"
                onClick={() => openUrl("https://aka.ms/MinecraftEULA")}
                className="text-accent underline hover:text-accent-strong"
              >
                Leer el EULA
              </button>
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
              <button
                type="button"
                onClick={() => setShowEula(false)}
                className="rounded-lg border border-border px-3.5 py-2 text-sm hover:bg-surface-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={acceptEulaAndStart}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-bg hover:bg-accent-strong"
              >
                Acepto y arrancar
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServerPage;
