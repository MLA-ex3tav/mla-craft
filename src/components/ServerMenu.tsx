import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import RemoveServerDialog from "./RemoveServerDialog";
import { openPath } from "../lib/transport";
import { ArrowUpRight, Boxes, FolderOpen, Settings2, Trash2, Users, X, Plus, Server, Archive, Terminal, SlidersHorizontal } from "lucide-react";
import { errorMessage, listInstances } from "../lib/api";
import NewServerDialog from "./NewServerDialog";
import type { Instance } from "../lib/types";

const MenuContext = createContext<(instance: Instance, x: number, y: number) => void>(() => {});
export const useServerMenu = () => useContext(MenuContext);

export default function ServerMenuProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<{ instance: Instance | null; x: number; y: number; host?: HTMLElement } | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Instance | null>(null);
  const instances = useRef<Instance[]>([]);
  const [error, setError] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { setTarget(null); }, [location]);
  useEffect(() => {
    let alive = true;
    let version = 0;
    async function refresh() {
      const current = ++version;
      try { const list = await listInstances(); if (alive && current === version) instances.current = list; }
      catch { /* General navigation remains available if server loading fails. */ }
    }
    refresh();
    window.addEventListener("mla-instances-changed", refresh);
    return () => { alive = false; window.removeEventListener("mla-instances-changed", refresh); };
  }, [location.pathname]);
  useEffect(() => {
    function showGlobal(event: MouseEvent | KeyboardEvent) {
      if (event.defaultPrevented) return;
      const element = event.target instanceof Element ? event.target : null;
      if (!element || element.closest(".server-context-menu")) return;
      // Preserve native copy/paste and text-editing commands.
      if (element.closest("input, textarea, [contenteditable=true], .xterm") || window.getSelection()?.toString()) return;
      if (event instanceof KeyboardEvent && event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const id = element.closest<HTMLElement>("[data-server-context]")?.dataset.serverContext ?? (location.pathname.startsWith("/server/") ? location.pathname.split("/")[2] : undefined);
      const instance = instances.current.find((item) => item.id === id) ?? null;
      const rect = element.getBoundingClientRect();
      returnFocus.current = document.activeElement as HTMLElement;
      setTarget({ instance, host: element.closest<HTMLDialogElement>("dialog[open]") ?? document.body, x: event instanceof MouseEvent ? event.clientX : rect.left + 12, y: event instanceof MouseEvent ? event.clientY : rect.bottom + 4 });
    }
    document.addEventListener("contextmenu", showGlobal);
    document.addEventListener("keydown", showGlobal);
    return () => { document.removeEventListener("contextmenu", showGlobal); document.removeEventListener("keydown", showGlobal); };
  }, [location.pathname]);
  function close() { setTarget(null); returnFocus.current?.focus(); }
  useLayoutEffect(() => {
    if (!target || !menu.current) return;
    menu.current.showPopover();
    const rect = menu.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8))}px`;
    menu.current.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8))}px`;
    menu.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [target]);
  useEffect(() => {
    if (!target) return;
    function outside(event: PointerEvent) { if (!menu.current?.contains(event.target as Node)) setTarget(null); }
    function dismiss() { setTarget(null); }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", dismiss); };
  }, [target]);
  function remove(instance: Instance) { setRemoving(instance); }
  const instance = target?.instance;
  const actions: { label: string; icon: typeof Server; run: () => void | Promise<void>; danger?: boolean }[] = [
    ...(instance ? [
    { label: "Abrir servidor", icon: ArrowUpRight, run: () => navigate(`/server/${instance.id}`) },
    { label: "Consola", icon: Terminal, run: () => navigate(`/server/${instance.id}?tab=console`) },
    { label: "Jugadores", icon: Users, run: () => navigate(`/server/${instance.id}?tab=players`) },
    { label: "Mods / Plugins", icon: Boxes, run: () => navigate(`/server/${instance.id}?tab=content`) },
    { label: "Copias de seguridad", icon: Archive, run: () => navigate(`/server/${instance.id}?tab=backups`) },
    { label: "Reglas del mundo", icon: SlidersHorizontal, run: () => navigate(`/server/${instance.id}?tab=rules`) },
    { label: "Ajustes del servidor", icon: Settings2, run: () => navigate(`/server/${instance.id}?tab=settings`) },
    { label: "Abrir carpeta", icon: FolderOpen, run: () => { openPath(instance.dir).catch((e) => setError(errorMessage(e))); } },
    { label: "Quitar del gestor", icon: Trash2, danger: true, run: () => remove(instance) },
    ] : []),
    { label: "Todos los servidores", icon: Server, run: () => navigate("/") },
    { label: "Explorar contenido", icon: Boxes, run: () => navigate("/content") },
    { label: "Ajustes de la aplicación", icon: Settings2, run: () => navigate("/settings") },
    { label: "Crear servidor", icon: Plus, run: () => setCreating(true) },
  ];
  return <MenuContext.Provider value={(instance, x, y) => { returnFocus.current = document.activeElement as HTMLElement; setTarget({ instance, x, y }); }}>
    {children}
    {target && createPortal(<div ref={menu} popover="manual" role="menu" aria-label={instance ? `Opciones de ${instance.name}` : "Opciones de MLA Server"} className="server-context-menu" onContextMenu={(event) => event.preventDefault()} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null); }} onKeyDown={(event) => {
      const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); close(); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length; buttons[next]?.focus(); }
    }}><div className="server-menu-title">{instance?.name ?? "MLA Server"}<small>{instance ? "Servidor y navegación" : "Navegación y acciones"}</small></div>{actions.map(({ label, icon: Icon, run, danger }) => <button type="button" role="menuitem" key={label} className={danger ? "is-danger" : ""} onClick={() => { close(); run(); }}><Icon size={16} />{label}</button>)}</div>, target.host ?? document.body)}
    {removing && <RemoveServerDialog instance={removing} onClose={() => setRemoving(null)} onRemoved={() => { if (location.pathname === `/server/${removing.id}`) navigate("/"); setRemoving(null); }} />}
    {creating && <NewServerDialog onClose={() => setCreating(false)} onCreated={(created) => { setCreating(false); navigate(`/server/${created.id}`); }} />}
    {error && <div className="server-action-error" role="alert"><span>{error}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setError("")}><X size={17} /></button></div>}
  </MenuContext.Provider>;
}
