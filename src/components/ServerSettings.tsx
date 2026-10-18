import NumberField from "./NumberField";
import { useSectionSearch, matchesSearch } from "../lib/sectionSearch";
import Select from "./Select";
import { useEffect, useRef, useState } from "react";
import { Loader2, Cpu, SlidersHorizontal, Search, ChevronDown, Gamepad2, Users, Globe2, ShieldCheck, Network, Terminal } from "lucide-react";
import {
  errorMessage,
  getServerProperties,
  setServerProperties,
  updateServerSettings,
} from "../lib/api";
import type { Instance, ServerProperty } from "../lib/types";

interface Props {
  instance: Instance;
  onUpdated: (instance: Instance) => void;
  mode: "resources" | "rules";
}

const ruleGroups = [
  { id: "gameplay", title: "Jugabilidad", description: "Dificultad, modo de juego y combate.", icon: Gamepad2, keys: ["difficulty", "gamemode", "hardcore", "pvp", "allow-flight"] },
  { id: "world", title: "Mundo y generación", description: "Semilla, dimensiones, criaturas y estructuras.", icon: Globe2, keys: ["level-name", "level-seed", "allow-nether", "spawn-monsters", "spawn-animals", "spawn-npcs", "generate-structures"] },
  { id: "players", title: "Jugadores y acceso", description: "Capacidad, lista de permitidos y cuentas.", icon: Users, keys: ["max-players", "online-mode", "white-list", "enforce-whitelist", "player-idle-timeout"] },
  { id: "security", title: "Protección y permisos", description: "Spawn, operadores y seguridad de las conexiones.", icon: ShieldCheck, keys: ["spawn-protection", "enforce-secure-profile", "prevent-proxy-connections", "op-permission-level", "function-permission-level", "enable-command-block"] },
  { id: "performance", title: "Rendimiento", description: "Distancias de carga y compresión de datos.", icon: Cpu, keys: ["view-distance", "simulation-distance", "network-compression-threshold"] },
  { id: "network", title: "Servidor y conexión", description: "Nombre público, dirección y estado del servidor.", icon: Network, keys: ["motd", "server-port", "server-ip", "enable-status"] },
  { id: "remote", title: "Administración remota", description: "Acceso y credenciales de RCON.", icon: Terminal, keys: ["enable-rcon", "rcon.port", "rcon.password"] },
  { id: "other", title: "Otras opciones", description: "Configuración adicional del servidor.", icon: SlidersHorizontal, keys: [] },
];
const categorizedKeys = new Set(ruleGroups.flatMap((group) => group.keys));

const propertyUnits: Record<string, string> = {
  "max-players": "jugadores", "view-distance": "chunks", "simulation-distance": "chunks",
  "spawn-protection": "bloques", "player-idle-timeout": "minutos",
  "network-compression-threshold": "bytes", "op-permission-level": "nivel",
  "function-permission-level": "nivel",
};

const ruleOptionLabels: Record<string, Record<string, string>> = {
  difficulty: { peaceful: "Pacífico", easy: "Fácil", normal: "Normal", hard: "Difícil" },
  gamemode: { survival: "Supervivencia", creative: "Creativo", adventure: "Aventura", spectator: "Espectador" },
};

function PropertyRow({
  prop,
  value,
  onChange,
}: {
  prop: ServerProperty;
  value: string;
  onChange: (value: string) => void;
}) {

  let control: React.ReactNode;
  if (prop.kind === "bool") {
    control = (
      <input
        aria-label={prop.label}
        role="switch"
        type="checkbox"
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        className="setting-switch"
      />
    );
  } else if (prop.kind === "enum") {
    control = (
      <Select
        aria-label={prop.label}
        value={value}
        onChange={(value) => onChange(value)}
        className="rule-value-select"
      >
        {(prop.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {ruleOptionLabels[prop.key]?.[opt] ?? opt}
          </option>
        ))}
      </Select>
    );
  } else if (prop.kind === "int") {
    control = <NumberField aria-label={prop.label} value={value} step={1}
      unit={propertyUnits[prop.key]} onChange={(event) => onChange(event.target.value)} />;
  } else {
    control = (
      <input
        aria-label={prop.label}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="setting-text-field"
      />
    );
  }

  return (
    <div className="property-row">
      <div className="min-w-0" title={prop.description}>
        <div className="text-sm font-medium">{prop.label}</div>
        <p className="property-description">{prop.description || prop.key}</p>
      </div>
      {control}
    </div>
  );
}

function ServerSettings({ instance, onUpdated, mode }: Props) {
  const { query, setQuery, shared: sharedSearch } = useSectionSearch();
  const [openGroup, setOpenGroup] = useState<string | null>("gameplay");
  const [props, setProps] = useState<ServerProperty[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(mode === "rules");
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [savingProps, setSavingProps] = useState(false);
  const [savingRes, setSavingRes] = useState(false);
  const pendingSave = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");

  const [memoryMax, setMemoryMax] = useState(instance.memoryMaxMb);
  const [port, setPort] = useState(instance.port);
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs.join("\n"));

  useEffect(() => {
    if (mode !== "rules") return;
    let cancelled = false;
    setLoading(true);
    getServerProperties(instance.id)
      .then((list) => {
        if (cancelled) return;
        setProps(list);
        const initial = Object.fromEntries(list.map((p) => [p.key, p.value]));
        setValues(initial);
        setSavedValues(initial);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [instance.id, mode]);

  async function saveProperties() {
    const invalid = props.find((prop) => prop.kind === "int" &&
      (!values[prop.key]?.trim() || !Number.isSafeInteger(Number(values[prop.key]))));
    if (invalid) { setError(`Introduce un número entero válido en «${invalid.label}».`); return; }
    setSavingProps(true);
    setError("");
    try {
      const submitted = { ...values };
      const changes = Object.fromEntries(Object.entries(submitted).filter(([key, value]) => value !== savedValues[key]));
      await setServerProperties(instance.id, changes);
      setSavedValues(submitted);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingProps(false);
    }
  }

  const rulesDirty = Object.keys(values).some((key) => values[key] !== savedValues[key]);
  const resourcesDirty = memoryMax !== instance.memoryMaxMb || port !== instance.port || jvmArgs !== instance.jvmArgs.join("\n");
  const dirty = mode === "rules" ? rulesDirty : resourcesDirty;
  const saving = savingProps || savingRes;
  async function saveResources() {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError("El puerto debe ser un número entre 1 y 65535.");
      return;
    }
    setSavingRes(true);
    setError("");
    try {
      const updated = await updateServerSettings(instance.id, {
        memoryMinMb: Math.min(instance.memoryMinMb, memoryMax),
        memoryMaxMb: memoryMax,
        jvmArgs: jvmArgs
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        port,
      });
      onUpdated(updated);
      setJvmArgs(updated.jvmArgs.join("\n"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingRes(false);
    }
  }

  useEffect(() => {
    if (loading || !dirty || saving) { pendingSave.current = null; return; }
    const save = () => { if (pendingSave.current !== save) return; pendingSave.current = null; void (mode === "rules" ? saveProperties() : saveResources()); };
    pendingSave.current = save;
    const timer = window.setTimeout(save, 650);
    return () => window.clearTimeout(timer);
    // Save only after edits; an error waits for another edit or an explicit retry.
  }, [values, memoryMax, port, jvmArgs, loading]);

  useEffect(() => () => { pendingSave.current?.(); }, []);

  const searching = query.trim().length > 0;
  const visibleGroups = ruleGroups.map((group) => ({
    ...group,
    properties: props.filter((prop) =>
      (group.id === "other" ? !categorizedKeys.has(prop.key) : group.keys.includes(prop.key)) &&
      matchesSearch(`${group.title} ${prop.label} ${prop.key} ${prop.description}`, query)),
  })).filter((group) => group.properties.length > 0);

  if (loading) {
    return (
      <div className="flex justify-center p-6 text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="settings-editor space-y-6">

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          <span role="alert">{error}</span>
          {dirty && <button type="button" disabled={saving} className="ml-3 underline" onClick={() => { pendingSave.current = null; void (mode === "rules" ? saveProperties() : saveResources()); }}>Reintentar guardado</button>}
        </div>
      )}


      {mode === "resources" && <section className="settings-section">
        <div className="mb-2 flex items-center justify-between">
          <div className="section-title"><Cpu size={20} /><div><h2>Rendimiento y conexión</h2><p>Asigna memoria y configura cómo arranca el servidor.</p></div></div>

        </div>
        <fieldset disabled={savingRes} className="resource-grid section-card-grid section-form-grid">
          <label hidden={!matchesSearch("Memoria asignada RAM GB", query)} className="block">
            <span className="mb-1 block text-xs text-muted">
              Memoria asignada
              <strong className="memory-value numeric-readout">{(memoryMax / 1024).toFixed(1)} <small>GB</small></strong>
            </span>
            <input
              type="range"
              min={1024}
              max={32768}
              step={512}
              value={memoryMax}
              onChange={(e) => setMemoryMax(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            <span className="range-limits"><span>1 GB</span><span>32 GB</span></span>
          </label>
          <label hidden={!matchesSearch("Puerto conexión", query)} className="block">
            <span className="mb-1 block text-xs text-muted">Puerto</span>
            <NumberField
              aria-label="Puerto del servidor"
              min={1} max={65535} step={1}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </label>
          <label hidden={!matchesSearch("Argumentos JVM Java", query)} className="col-span-2 block">
            <span className="mb-1 block text-xs text-muted">
              Argumentos JVM (uno por línea)
            </span>
            <textarea
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              rows={3}
              placeholder="-XX:+UseG1GC"
              className="setting-text-field setting-code-field"
            />
          </label>
        </fieldset>
      </section>}

      {mode === "rules" && <section className="settings-section">
        <div className="mb-2 flex items-center justify-between">
          <div className="section-title"><SlidersHorizontal size={20} /><div><h2>Reglas de tu mundo</h2><p>Personaliza el juego y el acceso al servidor.</p></div></div>

        </div>
        {!sharedSearch && <label className="search-field mb-4"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar configuración" placeholder="Buscar dificultad, jugadores, distancia…" /></label>}
        <div className="rule-groups">
          {visibleGroups.map((group) => {
            const Icon = group.icon;
            const expanded = searching || openGroup === group.id;
            const changed = group.properties.filter((prop) => values[prop.key] !== savedValues[prop.key]).length;
            return <section className="rule-group" key={group.id}>
              <button type="button" className="rule-group-heading" aria-expanded={expanded}
                aria-controls={`rules-${instance.id}-${group.id}`} disabled={searching}
                onClick={() => setOpenGroup((previous) => (previous === group.id ? null : group.id))}>
                <span className="rule-group-icon"><Icon size={21} /></span>
                <span className="rule-group-title"><strong>{group.title}</strong><small>{group.description}</small></span>
                {changed > 0 && <span className="rule-group-changed">{changed} sin guardar</span>}
                <span className="count-badge">{group.properties.length}</span>
                <ChevronDown size={18} className="rule-group-chevron" />
              </button>
              <fieldset id={`rules-${instance.id}-${group.id}`} hidden={!expanded} disabled={savingProps}
                aria-label={group.title} className="section-card-grid section-rule-grid rule-group-fields">
                {group.properties.map((prop) => <PropertyRow key={prop.key} prop={prop}
                  value={values[prop.key] ?? prop.value}
                  onChange={(v) => setValues((previous) => ({ ...previous, [prop.key]: v }))} />)}
              </fieldset>
            </section>;
          })}
          {visibleGroups.length === 0 && <p className="inner-panel p-8 text-center text-sm text-muted">{searching ? "No hay ajustes que coincidan con tu búsqueda." : "No hay propiedades disponibles. Instala e inicia el servidor para generar su configuración."}</p>}
        </div>
      </section>}
    </div>
  );
}

export default ServerSettings;
