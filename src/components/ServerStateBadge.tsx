import type { ServerState } from "../lib/types";

export const SERVER_STATE_TEXT: Record<ServerState, string> = {
  running: "Encendido", starting: "Iniciando…", stopping: "Deteniendo…", stopped: "Apagado", crashed: "Detenido con error",
};
export default function ServerStateBadge({ state, installed = true }: { state?: ServerState; installed?: boolean }) {
  return <span role="status" className={`server-live-badge state-${state ?? "unknown"}`}><i aria-hidden="true" />{!installed ? "Sin instalar" : state ? SERVER_STATE_TEXT[state] : "Comprobando…"}</span>;
}
