import { useState } from "react";
import { Globe, Crown } from "lucide-react";
import type { PlayerEntry } from "../lib/types";

// MCHeads resolves public Minecraft skins by account UUID or player name.
export default function PlayerAvatar({ player, operator = false }: { player: PlayerEntry; operator?: boolean }) {
  const uuid = player.uuid?.replace(/-/g, "");
  const validUuid = uuid && /^[0-9a-f]{32}$/i.test(uuid) && uuid[12] !== "3" ? uuid : undefined;
  const name = player.name && /^[a-zA-Z0-9_]{1,16}$/.test(player.name) ? player.name : undefined;
  const identity = validUuid ?? name;
  const url = !player.ip && identity ? `https://mc-heads.net/avatar/${encodeURIComponent(identity)}/64` : undefined;
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  return <span className="player-avatar-wrap"><span className="player-avatar player-skin-avatar">
    <span aria-hidden="true">{player.ip ? <Globe size={20} /> : String(player.name ?? "?").slice(0, 2).toUpperCase()}</span>
    {url && failed !== url && <img key={url} src={url} width={42} height={42} alt={`Cabeza de la skin de ${player.name ?? "Minecraft"}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoaded(url)} onError={() => setFailed(url)} className={loaded === url ? "is-loaded" : ""} />}
  </span>{operator && <span className="player-op-crown" role="img" aria-label="Operador del servidor" title="Operador del servidor"><Crown size={16} strokeWidth={2} /></span>}</span>;
}
