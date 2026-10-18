import { useServerStates } from "../lib/useServerStates";
import { SERVER_STATE_TEXT } from "./ServerStateBadge";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { listInstances } from "../lib/api";
import type { Instance } from "../lib/types";
import MinecraftBlock from "./MinecraftBlock";
import NewServerDialog from "./NewServerDialog";
import { useServerMenu } from "./ServerMenu";

export default function SidebarServers() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const states = useServerStates(instances.map((instance) => instance.id));
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const openMenu = useServerMenu();
  useEffect(() => {
    let alive = true;
    let request = 0;
    async function refresh() {
      const current = ++request;
      try { const list = await listInstances(); if (alive && current === request) { setInstances(list); setFailed(false); } }
      catch { if (alive && current === request) setFailed(true); }
    }
    refresh();
    window.addEventListener("mla-instances-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener("mla-instances-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [revision]);
  return <>
    <div className="sidebar-server-divider" />
    <nav aria-label="Tus servidores" className="sidebar-servers">
      {instances.map((instance) => <NavLink key={instance.id} to={`/server/${instance.id}`} title={`${instance.name} · ${states[instance.id] ? SERVER_STATE_TEXT[states[instance.id]] : "Comprobando"} · Clic derecho para opciones`} aria-label={`Abrir ${instance.name}: ${states[instance.id] ? SERVER_STATE_TEXT[states[instance.id]] : "Comprobando"}`} className={({ isActive }) => `sidebar-server${isActive ? " active" : ""}`} onContextMenu={(event) => { event.preventDefault(); event.currentTarget.focus(); openMenu(instance, event.clientX, event.clientY); }} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(instance, rect.right + 8, rect.top); } }}><MinecraftBlock type={instance.type} />{states[instance.id] === "running" && <span className="sidebar-online-dot" aria-hidden="true" />}</NavLink>)}
      {failed && <button type="button" className="sidebar-server" aria-label="Reintentar carga de servidores" title="No se pudieron cargar los servidores. Reintentar" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button>}
    </nav>
    <button type="button" className="sidebar-add-server" aria-label="Crear servidor" title="Crear servidor" onClick={() => setCreating(true)}><Plus size={21} /></button>
    {creating && <NewServerDialog onClose={() => setCreating(false)} onCreated={() => setCreating(false)} />}
  </>;
}
