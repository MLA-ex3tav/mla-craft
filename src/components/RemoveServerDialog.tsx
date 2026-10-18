import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { deleteInstance, errorMessage, serverStatus, stopServer } from "../lib/api";
import { SERVER_TYPE_LABELS, type Instance } from "../lib/types";
import MinecraftBlock from "./MinecraftBlock";

interface Props {
  instance: Instance;
  onClose: () => void;
  onRemoved: () => void;
}

export default function RemoveServerDialog({ instance, onClose, onRemoved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = dialog.current;
    panel?.showModal();
    cancel.current?.focus();
    return () => { panel?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);

  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (await serverStatus(instance.id).catch(() => false)) {
        await stopServer(instance.id).catch(() => {});
      }
      await deleteInstance(instance.id, true);
      onRemoved();
    } catch (e) {
      setError(errorMessage(e));
      pending.current = false;
      setBusy(false);
    }
  }

  return createPortal(<dialog ref={dialog} className="remove-server-dialog" aria-labelledby="remove-server-title" aria-describedby="remove-server-description" onCancel={(event) => { event.preventDefault(); if (!pending.current) onClose(); }} onContextMenu={(event) => event.stopPropagation()}>
    <header><span className="remove-server-symbol"><Trash2 size={23} strokeWidth={1.6} /></span><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar" className="remove-server-close"><X size={19} /></button></header>
    <h2 id="remove-server-title">¿Eliminar este servidor?</h2>
    <p id="remove-server-description">Se quitará de tu lista y se borrará su carpeta con todo su contenido.</p>
    <div className="remove-server-preview"><MinecraftBlock type={instance.type} /><div><strong>{instance.name}</strong><span>{SERVER_TYPE_LABELS[instance.type]} · Minecraft {instance.mcVersion}</span></div></div>
    <div className="remove-server-note"><AlertTriangle size={19} /><div><strong>Se borrará la carpeta completa</strong><p>El mundo, los mods, los plugins y la configuración se eliminarán de forma permanente.</p><span title={instance.dir}>{instance.dir}</span></div></div>
    {error && <p role="alert" className="remove-server-error">{error}</p>}
    <footer><button ref={cancel} type="button" disabled={busy} onClick={onClose} className="remove-server-cancel">Cancelar</button><button type="button" disabled={busy} onClick={remove} className="remove-server-confirm">{busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{busy ? "Eliminando…" : "Eliminar servidor"}</button></footer>
  </dialog>, document.body);
}
