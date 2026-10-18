import { useEffect, useState } from "react";
import { listen } from "./transport";
import { serverStatus } from "./api";
import type { ServerState, StateChange } from "./types";

export function useServerStates(ids: string[]) {
  const [states, setStates] = useState<Record<string, ServerState>>({});
  const key = JSON.stringify(ids);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const revisions = new Map<string, number>();
    const serverIds: string[] = JSON.parse(key);
    async function refresh() {
      await Promise.all(serverIds.map(async (id) => {
        const revision = revisions.get(id) ?? 0;
        try {
          const running = await serverStatus(id);
          if (!disposed && revision === (revisions.get(id) ?? 0)) setStates((previous) => ({ ...previous, [id]: running ? (previous[id] === "starting" || previous[id] === "stopping" ? previous[id] : "running") : "stopped" }));
        } catch { /* Keep the last confirmed state if a status query fails. */ }
      }));
    }
    listen<StateChange>("server-state", (change) => {
      if (disposed || !serverIds.includes(change.id)) return;
      revisions.set(change.id, (revisions.get(change.id) ?? 0) + 1);
      setStates((previous) => ({ ...previous, [change.id]: change.state }));
    }).then((stop) => { if (disposed) stop(); else { unlisten = stop; void refresh(); } });
    window.addEventListener("focus", refresh);
    return () => { disposed = true; unlisten?.(); window.removeEventListener("focus", refresh); };
  }, [key]);
  return states;
}
