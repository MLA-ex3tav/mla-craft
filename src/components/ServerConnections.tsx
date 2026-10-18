import { useSectionSearch, matchesSearch } from "../lib/sectionSearch";
import { useEffect, useRef, useState } from "react";
import { invoke } from "../lib/transport";
import { Check, Copy, Loader2, Network, RefreshCw } from "lucide-react";
import { EmptyPanel } from "./SectionUI";
import { errorMessage } from "../lib/api";

type Connections = { addresses: { name: string; network: string; description: string; ip: string }[]; port: number; bindIp: string };
export default function ServerConnections({ id, port }: { id: string; port: number }) {
  const { query } = useSectionSearch();
  const [data, setData] = useState<Connections | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  async function refresh() {
    const version = ++request.current;
    setLoading(true);
    try {
      const result = await invoke<Connections>("server_connections", { id });
      if (version === request.current) { setData(result); setError(""); }
    } catch (e) { if (version === request.current) setError(errorMessage(e)); }
    finally { if (version === request.current) setLoading(false); }
  }
  useEffect(() => {
    setData(null); setCopied(""); void refresh();
    window.addEventListener("focus", refresh);
    return () => { ++request.current; clearTimeout(timer.current); window.removeEventListener("focus", refresh); };
  }, [id, port]);
  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(""), 2000);
    } catch { setError("No se pudo copiar. Selecciona la dirección para copiarla manualmente."); }
  }
  return <section className="inner-page connection-page page-enter" aria-label="Conexión del servidor">
    
    <div className="connection-toolbar"><div><h3>Direcciones del servidor</h3><p>{data ? `${data.addresses.length} direcciones detectadas · Puerto ${data.port}` : "Consultando adaptadores de red"}</p></div><button type="button" onClick={refresh} disabled={loading} className="connection-refresh">{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}{loading ? "Actualizando…" : "Actualizar redes"}</button></div>
    {error && <p role="alert" className="connection-error">{error}</p>}
    {loading && !data ? <div className="connection-grid section-card-grid" role="status" aria-label="Detectando redes"><div className="skeleton" /><div className="skeleton" /></div> : data?.addresses.length === 0 ? <div className="inner-panel"><EmptyPanel icon={Network} title="No encontramos redes activas" description="Conecta el equipo a una red o activa tu red virtual y pulsa Actualizar redes." /></div> : <div className="connection-grid section-card-grid">
      {data?.addresses.filter((address) => matchesSearch(`${address.name} ${address.network} ${address.ip}:${data.port}`, query)).map((address) => {
        const endpoint = `${address.ip}:${data.port}`;
        const restricted = !!data.bindIp && data.bindIp !== "0.0.0.0" && data.bindIp !== "::" && data.bindIp !== address.ip;
        return <article key={`${address.name}:${address.ip}`} className="connection-card section-item-card">
          <header><span className="connection-network-icon"><Network size={22} /></span><div><h3>{address.network}</h3><p title={address.description}>{address.name}</p></div></header>
          <span className="connection-address-label">DIRECCIÓN DE CONEXIÓN</span>
          <code>{endpoint}</code>
          <footer><span>{restricted ? "No coincide con la IP configurada" : "Adaptador activo"}</span><button type="button" onClick={() => copy(endpoint)} aria-label={`Copiar ${endpoint}`}>{copied === endpoint ? <Check size={16} /> : <Copy size={16} />}{copied === endpoint ? "Copiada" : "Copiar IP"}</button></footer>
        </article>;
      })}
    </div>}
    {data && data.addresses.length > 0 && !data.addresses.some((address) => matchesSearch(`${address.name} ${address.network} ${address.ip}:${data.port}`, query)) && <p role="status">No hay direcciones que coincidan con tu búsqueda.</p>}
    <aside className="connection-guide"><Network size={19} /><div><h3>Conectados a la misma red</h3><p>Con ZeroTier, Tailscale o similares, los jugadores deben unirse a la misma red virtual. Para una dirección local, deben estar en tu red doméstica. La detección de una IP no confirma que el servidor sea accesible desde Internet.</p></div></aside>
    <span className="sr-only" role="status">{copied ? `Copiado: ${copied}` : ""}</span>
  </section>;
}
