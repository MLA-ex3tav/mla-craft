import PlayerDetailsDialog from "./PlayerDetailsDialog";
import { useSectionSearch } from "../lib/sectionSearch";
import PlayerAvatar from "./PlayerAvatar";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Users,
  Search,
  ListChecks,
  ListPlus,
  Crown,
  ShieldOff,
  UserX,
  UserCheck,
  LogOut,
  Ban,
  Copy,
  MoreVertical,
  Heart,
  Globe,
  Radio,
} from "lucide-react";
import {
  errorMessage,
  getPlayers,
  lookupPlayer,
  onlinePlayers,
  removePlayer,
  savePlayerList,
  sendServerCommand,
  serverStatus,
} from "../lib/api";
import type { Instance, PlayerEntry, PlayersData } from "../lib/types";
import { cx } from "../lib/cx";

import { EmptyPanel } from "./SectionUI";

interface Props {
  instance: Instance;
}

const SEGMENTS = [
  { key: "whitelist", label: "Whitelist", list: "whitelist", field: "whitelist", idField: "uuid" },
  { key: "ops", label: "Operadores", list: "ops", field: "ops", idField: "uuid" },
  { key: "bans", label: "Baneados", list: "bans", field: "bannedPlayers", idField: "uuid" },
  { key: "ips", label: "IPs baneadas", list: "bannedIps", field: "bannedIps", idField: "ip" },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];
type TabKey = "online" | SegmentKey;

const now = () =>
  new Date().toISOString().slice(0, 19).replace("T", " ") + " +0000";

function samePlayer(a: PlayerEntry, b: PlayerEntry) {
  if (a.uuid && b.uuid) return a.uuid.replace(/-/g, "").toLowerCase() === b.uuid.replace(/-/g, "").toLowerCase();
  return !!a.name && !!b.name && a.name.toLowerCase() === b.name.toLowerCase();
}

function PlayersTab({ instance }: Props) {
  const [data, setData] = useState<PlayersData | null>(null);
  const [segment, setSegment] = useState<TabKey>("online");
  const [online, setOnline] = useState<string[]>([]);
  const { query, setQuery, shared: sharedSearch, toolbarTarget } = useSectionSearch();
  const [input, setInput] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: PlayerEntry } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState<PlayerEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    serverStatus(instance.id).then((value) => !cancelled && setRunning(value)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [instance.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try { const next = await getPlayers(instance.id); if (!cancelled) setData(next); }
      catch (e) { if (!cancelled) setError(errorMessage(e)); }
      finally { pending = false; if (!cancelled) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [instance.id]);

  // Sondea los jugadores conectados mientras se ve la pestaña "En línea".
  useEffect(() => {
    if (segment !== "online") return;
    let cancelled = false;
    const poll = () => {
      onlinePlayers(instance.id)
        .then((names) => !cancelled && setOnline(names))
        .catch(() => {});
    };
    poll();
    const handle = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [segment, instance.id]);

  const active = segment === "online" ? null : SEGMENTS.find((s) => s.key === segment)!;
  const entries: PlayerEntry[] = segment === "online"
    ? online.map((name) => ({ name }))
    : data
      ? data[active!.field]
      : [];

  const visibleEntries = entries.filter((entry) => `${entry.name ?? ""} ${entry.ip ?? ""} ${entry.uuid ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  function playerBadges(entry: PlayerEntry) {
    const op = data?.ops.find((player) => samePlayer(player, entry));
    const allowed = data?.whitelist.some((player) => samePlayer(player, entry));
    const banned = entry.ip ? data?.bannedIps.some((player) => player.ip === entry.ip) : data?.bannedPlayers.some((player) => samePlayer(player, entry));
    return <span className="player-role-badges">
      {op && <span className="player-role-badge is-op"><Crown size={13} />OP{typeof op.level === "number" ? ` · Nivel ${op.level}` : ""}</span>}
      {allowed && <span className="player-role-badge"><UserCheck size={13} />Whitelist</span>}
      {banned && <span className="player-role-badge is-banned"><Ban size={13} />Baneado</span>}
    </span>;
  }

  async function add() {
    const value = input.trim();
    if (!active || !value || !data || busy) return;
    setBusy(true);
    setError("");
    try {
      let entry: PlayerEntry;
      if (segment === "ips") {
        entry = {
          ip: value,
          created: now(),
          source: "MLA Server",
          expires: "forever",
          reason: reason || "Baneado desde MLA Server",
        };
      } else {
        const id = await lookupPlayer(value);
        if (segment === "ops") {
          entry = {
            uuid: id.uuid,
            name: id.name,
            level: 4,
            bypassesPlayerLimit: false,
          };
        } else if (segment === "bans") {
          entry = {
            uuid: id.uuid,
            name: id.name,
            created: now(),
            source: "MLA Server",
            expires: "forever",
            reason: reason || "Baneado desde MLA Server",
          };
        } else {
          entry = { uuid: id.uuid, name: id.name };
        }
      }
      const next = [...entries, entry];
      await savePlayerList(instance.id, active.list, next);
      setData({ ...data, [active.field]: next });
      setInput("");
      setReason("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: PlayerEntry) {
    if (!data || !active) return;
    const value = entry[active.idField];
    if (typeof value !== "string") return;
    setError("");
    try {
      const next = await removePlayer(
        instance.id,
        active.list,
        active.idField,
        value,
      );
      setData(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    menuRef.current.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    menuRef.current.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    function outside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function refreshLists() {
    getPlayers(instance.id).then(setData).catch(() => {});
    onlinePlayers(instance.id).then(setOnline).catch(() => {});
  }

  async function runCommand(command: string) {
    setError("");
    setMenu(null);
    try {
      await sendServerCommand(instance.id, command);
      window.setTimeout(refreshLists, 700);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function menuActions(entry: PlayerEntry) {
    const name = typeof entry.name === "string" ? entry.name : "";
    const ip = typeof entry.ip === "string" ? entry.ip : "";
    const lists = data ?? { whitelist: [], ops: [], bannedPlayers: [], bannedIps: [] };
    const inWhitelist = !!name && lists.whitelist.some((e) => samePlayer(e, entry));
    const inOps = !!name && lists.ops.some((e) => samePlayer(e, entry));
    const banned = !!name && lists.bannedPlayers.some((e) => samePlayer(e, entry));
    const bannedIp = !!ip && lists.bannedIps.some((e) => e.ip === ip);

    const actions: { label: string; icon: typeof Users; run: () => void | Promise<void>; danger?: boolean }[] = [];
    if (name || entry.uuid) {
      actions.push({ label: "Ver ficha e inventario", icon: Heart, run: () => { setMenu(null); setDetails(entry); } });
    }
    if (name) {
      actions.push({ label: "Copiar nombre", icon: Copy, run: () => { navigator.clipboard?.writeText(name).catch(() => {}); } });
    }
    if (running && name) {
      if (!inOps) actions.push({ label: "Dar OP", icon: Crown, run: () => runCommand(`op ${name}`) });
      if (inOps) actions.push({ label: "Quitar OP", icon: ShieldOff, run: () => runCommand(`deop ${name}`) });
      if (!inWhitelist) actions.push({ label: "Añadir a whitelist", icon: ListPlus, run: () => runCommand(`whitelist add ${name}`) });
      if (inWhitelist) actions.push({ label: "Quitar de whitelist", icon: UserX, run: () => runCommand(`whitelist remove ${name}`) });
      if (!banned) actions.push({ label: "Banear", icon: Ban, danger: true, run: () => runCommand(`ban ${name}`) });
      if (banned) actions.push({ label: "Desbanear", icon: UserCheck, run: () => runCommand(`pardon ${name}`) });
    }
    if (running && segment === "online" && name) {
      actions.push({ label: "Expulsar del servidor", icon: LogOut, run: () => runCommand(`kick ${name}`) });
    }
    if (running && ip) {
      if (!bannedIp) actions.push({ label: "Banear IP", icon: Ban, danger: true, run: () => runCommand(`ban-ip ${ip}`) });
      if (bannedIp) actions.push({ label: "Desbanear IP", icon: UserCheck, run: () => runCommand(`pardon-ip ${ip}`) });
    }
    if (segment !== "online" && (entry.uuid || entry.ip)) {
      actions.push({ label: "Quitar de la lista", icon: Trash2, danger: true, run: () => { setMenu(null); remove(entry); } });
    }
    return actions;
  }

  if (loading) {
    return (
      <div className="flex justify-center p-6 text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const navigation = (
    <div className="segment-control" role="group" aria-label="Listas de jugadores">
        <button
          type="button"
          aria-pressed={segment === "online"}
          onClick={() => { setSegment("online"); setQuery(""); }}
          className={cx(
            "flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold",
            segment === "online" ? "bg-accent-soft text-accent" : "text-muted hover:text-fg",
          )}
        >
          <Radio size={16} />
          En línea
          {` (${online.length})`}
        </button>
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={segment === s.key}
            onClick={() => { setSegment(s.key); setQuery(""); }}
            className={cx(
              "flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold",
              segment === s.key
                ? "bg-accent-soft text-accent"
                : "text-muted hover:text-fg",
            )}
          >
            {s.key === "whitelist" ? <ListChecks size={16} /> : s.key === "ops" ? <Crown size={16} /> : s.key === "bans" ? <UserX size={16} /> : <Globe size={16} />}
            {s.label}
            {data && ` (${data[s.field].length})`}
          </button>
        ))}
      </div>
  );

  return (
    <div className="inner-page page-enter space-y-5">
      
      {toolbarTarget ? createPortal(navigation, toolbarTarget) : navigation}

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {segment !== "online" && (
      <section className="inner-panel add-player-panel">
      <h3><UserPlus size={18} /> {segment === "ips" ? "Restringir una dirección IP" : segment === "ops" ? "Añadir un operador" : segment === "bans" ? "Bloquear un jugador" : "Dar acceso a un jugador"}</h3>
      <p className="panel-description">{segment === "ops" ? "Los operadores añadidos reciben permisos de nivel 4." : segment === "whitelist" ? "Añade el nombre de Minecraft a la lista de jugadores permitidos." : "Indica a quién restringir y el motivo de la medida."}</p>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label={segment === "ips" ? "Dirección IP" : "Nombre de Minecraft"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={segment === "ips" ? "Dirección IP" : "Nombre del jugador"}
          className="min-w-56 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {(segment === "bans" || segment === "ips") && (
          <input
            aria-label="Motivo del bloqueo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo"
            className="min-w-40 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}
        <button
          type="button"
          onClick={add}
          disabled={busy || !data || !input.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : segment === "ops" ? (
            <UserPlus size={14} />
          ) : (
            <Plus size={14} />
          )}
          Añadir
        </button>
      </div>

      </section>
      )}
      <div className="list-toolbar"><h3>{active ? active.label : "Jugadores en línea"} <span className="count-badge">{entries.length}</span></h3>{!sharedSearch && <label className="search-field"><Search size={16} /><input aria-label="Buscar en la lista de jugadores" placeholder="Buscar jugador…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>}</div>
      <div className="section-card-grid">
        {visibleEntries.length === 0 ? (
          <EmptyPanel icon={segment === "online" ? Radio : Users} title={query ? "No encontramos coincidencias" : segment === "online" ? "Nadie conectado ahora mismo" : "Todavía no hay jugadores en esta lista"} description={query ? "Prueba con otro nombre, UUID o dirección IP." : segment === "online" ? "Los jugadores conectados aparecerán aquí automáticamente." : "Los jugadores que añadas aparecerán aquí para que puedas gestionar su acceso."} />
        ) : (
          visibleEntries.map((entry, i) => (
            <div
              key={`${entry.uuid ?? entry.name ?? entry.ip ?? i}`}
              className="section-item-card player-card"
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({ entry, x: event.clientX, y: event.clientY });
              }}
            >
              <div className="section-card-top"><PlayerAvatar player={entry} operator={!!data?.ops.some((player) => samePlayer(player, entry))} /><span className={cx("section-card-tag player-list-tag", segment === "online" && "is-online")}>{segment === "online" && <i aria-hidden="true" />}{segment === "online" ? "En línea" : active?.label}</span></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  {entry.ip ? entry.ip : <button type="button" className="player-name-button" title="Ver ficha e inventario" onClick={() => setDetails(entry)}>{entry.name ?? "Jugador"}</button>}
                </div>
                <div className="truncate text-[11px] text-muted">
                  {entry.uuid ?? entry.ip}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </div>
                {playerBadges(entry)}
              </div>
              <footer className="section-card-footer">
              {entry.ip ? <span>Gestionar dirección</span> : <button type="button" className="player-details-link" onClick={() => setDetails(entry)}><Heart size={14} />Ver ficha</button>}
              <button
                type="button"
                aria-label={`Opciones de ${entry.name ?? entry.ip}`}
                title="Opciones"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ entry, x: rect.right, y: rect.top });
                }}
                className="rounded-lg border border-border p-1.5 text-muted hover:text-fg"
              >
                <MoreVertical size={14} />
              </button>
              {segment !== "online" && (
                <button
                  type="button"
                  aria-label={`Quitar ${entry.name ?? entry.ip} de ${active ? active.label : "la lista"}`}
                  onClick={() => remove(entry)}
                  className="rounded-lg border border-border p-1.5 text-muted hover:border-danger/50 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
              </footer>
            </div>
          ))
        )}
      </div>

      {details && <PlayerDetailsDialog id={instance.id} player={details} operator={!!data?.ops.some((player) => samePlayer(player, details))} onClose={() => setDetails(null)} />}
      {menu && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Opciones de ${menu.entry.name ?? menu.entry.ip}`}
          className="server-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="server-menu-title">
            {String(menu.entry.name ?? menu.entry.ip ?? "Jugador")}
            <small>{segment === "online" ? "Jugador en línea" : active ? active.label : "Jugador"}</small>
            {playerBadges(menu.entry)}
          </div>
          {menuActions(menu.entry).map(({ label, icon: Icon, run, danger }) => (
            <button
              type="button"
              role="menuitem"
              key={label}
              className={danger ? "is-danger" : ""}
              onClick={() => { setMenu(null); run(); }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default PlayersTab;
