import { Timer } from "lucide-react";

export default function ServerModeBadge({ enabled }: { enabled?: boolean }) {
  if (!enabled) return null;
  return <span className="server-mode-badge" title="Modo cooperativo: /stop inicia una nueva partida"><Timer size={13} aria-hidden="true" />MCSR Co-op</span>;
}
