import NumberField from "./NumberField";
import Select from "./Select";
import { useEffect, useMemo, useRef, useState } from "react";
import { openDirectory } from "../lib/transport";
import MinecraftBlock from "./MinecraftBlock";
import { FolderOpen, Loader2, X, Check, ArrowRight, Cpu, Layers, HardDrive } from "lucide-react";
import { createInstance, errorMessage, installServer, listBuilds, listMcVersions } from "../lib/api";
import { useTaskProgress } from "../lib/useTaskProgress";
import {
  SERVER_TYPES,
  SERVER_TYPE_LABELS,
  type BuildInfo,
  type Instance,
  type McVersion,
  type ServerType,
} from "../lib/types";


interface Props {
  onClose: () => void;
  onCreated: (instance: Instance) => void;
}

const TYPE_DESCRIPTIONS: Record<ServerType, string> = {
  vanilla: "Minecraft original", paper: "Plugins y rendimiento", spigot: "Plugins clásicos",
  fabric: "Mods ligeros", forge: "Ecosistema de mods", neoforge: "Mods de nueva generación",
};

function sanitizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function joinPath(base: string, name: string): string {
  return `${base.replace(/[\\/]+$/, "")}\\${name}`;
}

function NewServerDialog({ onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = dialogRef.current;
    panel?.querySelector<HTMLElement>("input")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, []);
  const [dir, setDir] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<ServerType>("vanilla");
  const [versions, setVersions] = useState<McVersion[]>([]);
  const [version, setVersion] = useState("");
  const [builds, setBuilds] = useState<BuildInfo[]>([]);
  const [build, setBuild] = useState("");
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [memory, setMemory] = useState(4096);
  const [port, setPort] = useState(25565);
  const [mcsrCoop, setMcsrCoop] = useState(false);

  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingBuilds, setLoadingBuilds] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const tasks = useTaskProgress();
  const task = createdId ? tasks[createdId] : undefined;

  const isPaperBuild = type === "paper";
  const isLoader = type === "fabric" || type === "neoforge" || type === "forge";
  const needsBuild = isPaperBuild || isLoader;

  const subfolder = useMemo(() => {
    const base = sanitizeName(name);
    return `mla-${base || `${type}-${version || "server"}`}`;
  }, [name, type, version]);
  const finalDir = dir ? joinPath(dir, subfolder) : "";

  useEffect(() => {
    let cancelled = false;
    setVersions([]);
    setVersion("");
    setBuilds([]);
    setBuild("");
    setError("");
    setLoadingVersions(true);
    listMcVersions(type)
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        if (list.length > 0) setVersion(list.find((v) => v.versionType === "release")?.id ?? "");
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoadingVersions(false));
    return () => {
      cancelled = true;
    };
  }, [type]);

  useEffect(() => {
    if (!needsBuild || !version) {
      setBuilds([]);
      setBuild("");
      setLoadingBuilds(false);
      return;
    }
    let cancelled = false;
    setBuilds([]);
    setBuild("");
    setLoadingBuilds(true);
    listBuilds(type, version)
      .then((list) => {
        if (cancelled) return;
        setBuilds(list);
        if (list.length > 0) setBuild(list[0].id);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoadingBuilds(false));
    return () => {
      cancelled = true;
    };
  }, [type, version, needsBuild]);

  async function pickFolder() {
    const selected = await openDirectory();
    if (typeof selected === "string") {
      setDir(selected);
    }
  }

  async function submit() {
    if (creating) return;
    setError("");
    if (!Number.isInteger(port) || port < 1 || port > 65535) return setError("El puerto debe estar entre 1 y 65535.");
    if (!dir.trim()) return setError("Selecciona una carpeta base.");
    if (!version) return setError("Selecciona una versión de Minecraft.");

    setCreating(true);
    let finished: Instance | null = null;
    try {
      const created = await createInstance({
        dir: finalDir,
        name: name.trim() || "Mi servidor",
        type,
        mcVersion: version,
        loaderVersion: isLoader && build ? build : null,
        build: isPaperBuild && build ? Number(build) : null,
        memoryMinMb: Math.min(1024, memory),
        memoryMaxMb: memory,
        port,
        mcsrCoop: mcsrCoop && type !== "paper" && type !== "spigot",
      });
      setCreatedId(created.id);
      finished = await installServer(created.id);
      window.dispatchEvent(new Event("mla-instances-changed"));
    } catch (e) {
      setError(errorMessage(e));
    }
    setCreating(false);
    setCreatedId(null);
    if (finished) onCreated(finished);
  }

  const filtered = versions.filter(
    (v) => showSnapshots || v.versionType === "release",
  );

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center p-4">
      <div ref={dialogRef} onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented && !creating) onClose(); }} role="dialog" aria-modal="true" aria-labelledby="new-server-title" aria-describedby="new-server-description" className="dialog-panel new-server-dialog">
        <header className="new-server-header">
          <span className="new-server-emblem"><MinecraftBlock type={type} /></span>
          <div><span className="new-server-eyebrow">UN NUEVO MUNDO</span><h2 id="new-server-title">Crea tu servidor</h2><p id="new-server-description">Elige cómo jugar. Hazlo tuyo.</p></div>
          <button type="button" onClick={onClose} disabled={creating} aria-label="Cerrar" className="new-server-close"><X size={19} /></button>
        </header>
        <form className="new-server-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="new-server-body">
            <fieldset disabled={creating} className="new-server-fields">
              <label className="new-server-name">Nombre del servidor <span>Opcional</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi servidor" maxLength={80} autoComplete="off" />
              </label>
              <section className="new-server-section" aria-labelledby="server-software-heading">
                <h3 id="server-software-heading"><Layers size={16} /> Experiencia de juego</h3>
                <div className="new-server-types" role="group" aria-label="Tipo de servidor">
                  {SERVER_TYPES.map((item) => <button key={item} type="button" className="new-server-type" aria-pressed={type === item} onClick={() => setType(item)}>
                    <MinecraftBlock type={item} /><span><strong>{SERVER_TYPE_LABELS[item]}</strong><small>{TYPE_DESCRIPTIONS[item]}</small></span>{type === item && <Check className="new-server-type-check" size={13} />}
                  </button>)}
                </div>
                <div className={`new-server-version-grid ${needsBuild ? "has-build" : ""}`}>
                  <label>Versión de Minecraft
                    <Select aria-label="Versión de Minecraft" value={version} onChange={setVersion} disabled={loadingVersions || filtered.length === 0}>
                      {loadingVersions ? <option value="">Cargando versiones…</option> : filtered.length === 0 ? <option value="">No hay versiones disponibles</option> : filtered.map((v) => <option key={v.id} value={v.id}>{v.id}{v.javaMajor ? ` · Java ${v.javaMajor}` : ""}</option>)}
                    </Select>
                  </label>
                  {needsBuild && <label>{isPaperBuild ? "Compilación" : "Versión del cargador"}
                    <Select aria-label={isPaperBuild ? "Compilación" : "Versión del cargador"} value={build} onChange={setBuild} disabled={loadingBuilds || builds.length === 0}>
                      {loadingBuilds ? <option value="">Cargando…</option> : builds.length === 0 ? <option value="">Sin versiones disponibles</option> : builds.map((b) => <option key={b.id} value={b.id}>{isPaperBuild ? `#${b.id}` : b.id}{b.channel ? ` (${b.channel})` : ""}</option>)}
                    </Select>
                  </label>}
                </div>
                <label className="new-server-snapshots"><input type="checkbox" checked={showSnapshots} onChange={(e) => {
                  setShowSnapshots(e.target.checked);
                  if (e.target.checked && !version) setVersion(versions[0]?.id ?? "");
                  if (!e.target.checked && !versions.some((v) => v.id === version && v.versionType === "release")) setVersion(versions.find((v) => v.versionType === "release")?.id ?? "");
                }} /> Incluir versiones experimentales <span>Snapshots</span></label>
              </section>
              <section className="new-server-section">
                <label className="new-server-snapshots"><input type="checkbox" checked={mcsrCoop && type !== "paper" && type !== "spigot"}
                  disabled={type === "paper" || type === "spigot"} onChange={(event) => setMcsrCoop(event.target.checked)} /> MCSR Co-op</label>
                <p className="new-server-help">Cada /stop elimina el mundo y comienza una partida con semilla nueva. Detener desde la app apaga el servidor. Requiere Node.js instalado. Disponible para Vanilla y servidores con mods.</p>
              </section>
              <section className="new-server-section" aria-labelledby="server-resources-heading">
                <h3 id="server-resources-heading"><Cpu size={16} /> Recursos y conexión</h3>
                <div className="new-server-resources">
                  <label className="new-server-memory"><span>Memoria máxima <output className="numeric-readout">{(memory / 1024).toFixed(1)} <small>GB</small></output></span>
                    <input type="range" min={1024} max={16384} step={512} value={memory} onChange={(e) => setMemory(Number(e.target.value))} />
                    <span className="new-server-range-labels"><span>1 GB</span><span>16 GB</span></span>
                  </label>
                  <label>Puerto<NumberField min={1} max={65535} step={1} required value={port} onChange={(e) => setPort(Number(e.target.value))} /><small className="new-server-help">Por defecto: 25565</small></label>
                </div>
              </section>
              <section className="new-server-section" aria-labelledby="server-storage-heading">
                <h3 id="server-storage-heading"><HardDrive size={16} /> Ubicación</h3>
                <div className="new-server-folder"><label className="sr-only" htmlFor="server-base-folder">Carpeta base</label><input id="server-base-folder" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Selecciona una carpeta base" /><button type="button" onClick={pickFolder}><FolderOpen size={16} /> Elegir carpeta</button></div>
                <p className="new-server-destination">Se creará una carpeta para este servidor:<span title={finalDir || subfolder}>{finalDir || subfolder}</span></p>
              </section>
            </fieldset>
            {creating && (
              <div className="mb-3 space-y-1">
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{task?.message ?? (createdId ? "Instalando el servidor…" : "Creando el servidor…")}</span>
                  <span title="Avance estimado de la instalación por etapas">{Math.round(task?.percent ?? 0)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${task?.percent ?? 0}%` }} />
                </div>
              </div>
            )}
            {error && <p role="alert" className="new-server-error">{error}</p>}
          </div>
          <footer className="new-server-footer"><span>{SERVER_TYPE_LABELS[type]}{version ? ` · ${version}` : ""}</span><div><button type="button" onClick={onClose} disabled={creating} className="new-server-cancel">Cancelar</button><button type="submit" disabled={creating || loadingVersions || loadingBuilds || !version || (needsBuild && !build)} className="new-server-create">{creating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}{creating ? (createdId ? "Instalando…" : "Creando…") : "Crear servidor"}</button></div></footer>
        </form>
      </div>
    </div>
  );
}

export default NewServerDialog;
