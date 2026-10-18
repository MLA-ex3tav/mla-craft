import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Apple, Box, Copy, Heart, Loader2, MapPin, RefreshCw, Skull, Sparkles, X } from "lucide-react";
import { errorMessage, getPlayerSnapshot } from "../lib/api";
import type { PlayerEntry, PlayerInventoryItem, PlayerSnapshot } from "../lib/types";
import PlayerAvatar from "./PlayerAvatar";

function dimension(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "Dimensión no disponible";
  return ({ "minecraft:overworld": "Mundo principal", "minecraft:the_nether": "Nether", "minecraft:the_end": "End", "0": "Mundo principal", "-1": "Nether", "1": "End" } as Record<string, string>)[String(value)] ?? String(value);
}
function itemName(id: string) { return id.replace(/^minecraft:/, "").replace(/_/g, " "); }
function ItemIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  const vanilla = /^minecraft:[a-z0-9_]+$/.test(id);
  return vanilla && !failed ? <img className="inventory-item-icon" src={`https://blockrender.dev/render/item/${id.slice(10)}.png?size=64`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="inventory-unknown" title="Icono no disponible"><Box size={24} /><small>{itemName(id).slice(0, 3)}</small></span>;
}
function InventorySkin({ player }: { player: PlayerEntry }) {
  const uuid = player.uuid?.replace(/-/g, "");
  const identity = uuid && /^[a-f0-9]{32}$/i.test(uuid) && uuid[12] !== "3" ? uuid : player.name;
  const [failed, setFailed] = useState(false);
  return <div className="inventory-character">{identity && !failed
    ? <img src={`https://mc-heads.net/player/${encodeURIComponent(identity)}`} alt={`Skin pública de ${player.name ?? "jugador"}`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span>Skin no disponible</span>}</div>;
}
function Inventory({ items, ender = false, player }: { items: PlayerInventoryItem[] | null; ender?: boolean; player: PlayerEntry }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (items === null) return <p className="player-detail-empty">No hay datos disponibles de este inventario.</p>;
  const slots = Array.from({ length: 27 }, (_, i) => ender ? i : i + 9);
  const hotbar = ender ? [] : Array.from({ length: 9 }, (_, i) => i);
  const equipment = [{ slot: 103, label: "Casco", symbol: "♜" }, { slot: 102, label: "Pechera", symbol: "♜" }, { slot: 101, label: "Pantalones", symbol: "Ⅱ" }, { slot: 100, label: "Botas", symbol: "⌞⌟" }];
  function slotCell(slot: number, label?: string) {
    const item = items?.find((item) => item.slot === slot);
    return <button key={slot} type="button" className={`inventory-slot ${item ? "has-item" : ""}`} aria-pressed={selected === slot}
      aria-label={`${label ?? `Casilla ${slot + 1}`}: ${item ? `${itemName(item.id)}, cantidad ${item.count}` : "vacía"}`}
      title={item ? `${item.id} × ${item.count}` : label ?? `Casilla ${slot + 1} vacía`} onClick={() => setSelected(slot)}>
      {item ? <><ItemIcon key={item.id} id={item.id} />{item.count > 1 && <strong>{item.count}</strong>}</> : label ? <span className="inventory-equipment-placeholder" aria-hidden="true">{label === "Mano secundaria" ? "◇" : <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={slot === 103 ? "M3 12V5l3-2h4l3 2v7h-3V9H6v3Z" : slot === 102 ? "M5 3 2 5v4h3v5h6V9h3V5l-3-2-1 3H6Z" : slot === 101 ? "M4 2h8v12H9V8H7v6H4Z" : "M3 3h4v10H1v-3h2Zm6 0h4v7h2v3H9Z"}/></svg>}</span> : null}
    </button>;
  }
  const selectedItem = items.find((item) => item.slot === selected);
  const extra = items.filter((item) => item.slot === null || (![...slots, ...hotbar].includes(item.slot) && (ender || ![100,101,102,103,-106].includes(item.slot))));
  return <div className="inventory-view">
    <div className="inventory-window">
      {!ender && <div className="inventory-upper">
        <div className="inventory-equipment">{equipment.map((part) => slotCell(part.slot, part.label))}</div>
        <InventorySkin key={player.uuid ?? player.name} player={player} />
        <div className="inventory-offhand">{slotCell(-106, "Mano secundaria")}</div>
        <div className="inventory-inspector"><span>Objeto seleccionado</span>{selectedItem ? <><ItemIcon key={selectedItem.id} id={selectedItem.id} /><strong>{itemName(selectedItem.id)}</strong><small>× {selectedItem.count}</small></> : <p>Selecciona un objeto para ver sus detalles.</p>}</div>
      </div>}
      <div className="inventory-grid" aria-label={ender ? "Cofre de Ender" : "Inventario"}>{slots.map((slot) => slotCell(slot))}</div>
      {!ender && <div className="inventory-grid inventory-hotbar" aria-label="Barra rápida">{hotbar.map((slot) => slotCell(slot))}</div>}
    </div>
    <div className="inventory-selection" aria-live="polite">{selectedItem ? <><strong>{selectedItem.id}</strong><span>Cantidad: {selectedItem.count}</span></> : selected !== null ? "Casilla vacía" : "Solo lectura · Selecciona una casilla para inspeccionarla."}</div>
    {extra.length > 0 && <div className="inventory-extra"><h4>Otros espacios</h4>{extra.map((item, index) => <p key={`${item.slot}-${index}`}>{item.id} × {item.count} · Espacio {item.slot ?? "sin identificar"}</p>)}</div>}
  </div>;
}

export default function PlayerDetailsDialog({ id, player, operator, onClose }: { id: string; player: PlayerEntry; operator: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = dialog.current;
    panel?.showModal();
    return () => { panel?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      setLoading(true);
      try {
        const data = await getPlayerSnapshot(id, player);
        if (!cancelled) { setSnapshot(data); setError(""); }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e)); setSnapshot(null); }
      } finally {
        if (!cancelled) { setLoading(false); timer = setTimeout(refresh, 3000); }
      }
    }
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, player.name, player.uuid, revision]);
  async function copy(coords: number[], label: string) {
    try { await navigator.clipboard.writeText(coords.map(Math.floor).join(" ")); setCopyStatus(`${label}: coordenadas copiadas.`); }
    catch { setCopyStatus("No se pudieron copiar las coordenadas."); }
  }
  return createPortal(<dialog ref={dialog} className="player-details-dialog" aria-labelledby="player-details-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><PlayerAvatar player={player} operator={operator} /><div><h2 id="player-details-title">{player.name ?? "Jugador"}</h2><p>Ficha del jugador · Solo lectura</p></div><button type="button" onClick={onClose} aria-label="Cerrar ficha"><X size={20} /></button></header>
    <div className="player-details-body">
      <div className="player-snapshot-note"><div><strong>{snapshot?.source === "live" ? "En vivo · Actualización automática" : "Último guardado disponible"}</strong><p>{snapshot?.source === "live" ? "Posición, corazones e inventario se actualizan mientras esta ficha está abierta, incluso con save-off." : "No hay respuesta en vivo. Se muestra el archivo guardado y se vuelve a consultar automáticamente."}</p>{snapshot?.savedAt && <time dateTime={snapshot.savedAt}>{new Date(snapshot.savedAt).toLocaleString()}</time>}</div><button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />Actualizar</button></div>
      {error && <p role="alert" className="player-detail-error">{error}</p>}
      {loading && !snapshot ? <div className="player-detail-loading" role="status"><Loader2 size={24} className="animate-spin" />Consultando jugador…</div> : snapshot && <>
        <div className="player-vitals">
          <div className="is-health"><Heart size={21} /><strong>{snapshot.health === null ? "—" : (snapshot.health / 2).toLocaleString()}</strong><span>Corazones</span></div>
          <div className="is-food"><Apple size={21} /><strong>{snapshot.food ?? "—"}</strong><span>Alimentación</span></div>
          <div className="is-xp"><Sparkles size={21} /><strong>{snapshot.xpLevel ?? "—"}</strong><span>Nivel de experiencia</span></div>
        </div>
        <p className="player-game-mode">Modo de juego: {snapshot.gameMode === null ? "No disponible" : ["Supervivencia", "Creativo", "Aventura", "Espectador"][snapshot.gameMode] ?? `Modo ${snapshot.gameMode}`}</p>
        <div className="player-locations">
          <section><h3><MapPin size={18} />{snapshot.source === "live" ? "Posición actual" : "Posición guardada"}</h3>{snapshot.position ? <><p>{dimension(snapshot.dimension)}</p><code>{snapshot.position.map(Math.floor).join(" / ")}</code><button onClick={() => copy(snapshot.position!, "Posición")} type="button"><Copy size={14} />Copiar XYZ</button></> : <p>No hay posición disponible.</p>}</section>
          <section><h3><Skull size={18} />Última muerte</h3>{snapshot.lastDeath ? <><p>{dimension(snapshot.lastDeath.dimension)}</p><code>{snapshot.lastDeath.pos.join(" / ")}</code><button onClick={() => copy(snapshot.lastDeath!.pos, "Última muerte")} type="button"><Copy size={14} />Copiar XYZ</button></> : <p>Sin ubicación registrada. Puede no haber una muerte guardada o esta versión no incluir el dato.</p>}</section>
        </div>
        {copyStatus && <p role="status" className="player-copy-status">{copyStatus}</p>}
        <section className="player-inventory-section"><h3>Inventario y equipo</h3><Inventory items={snapshot.inventory} player={player} /></section>
        <details className="player-ender-chest"><summary>Cofre de Ender</summary><Inventory items={snapshot.enderChest} player={player} ender /></details>
      </>}
    </div>
  </dialog>, document.body);
}
