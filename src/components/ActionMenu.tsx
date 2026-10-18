import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

type Action = { label: string; icon: LucideIcon; disabled?: boolean; run: () => void | Promise<void> };
export default function ActionMenu({ actions }: { actions: Action[] }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  function close() { panel.current?.hidePopover(); trigger.current?.focus(); }
  function show() {
    const menu = panel.current;
    const button = trigger.current;
    if (!menu || !button) return;
    if (menu.matches(":popover-open")) { close(); return; }
    menu.showPopover();
    const anchor = button.getBoundingClientRect();
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, anchor.bottom + rect.height + 8 < window.innerHeight ? anchor.bottom + 8 : anchor.top - rect.height - 8)}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  useEffect(() => {
    function dismiss() { panel.current?.hidePopover(); }
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => { window.removeEventListener("resize", dismiss); document.removeEventListener("scroll", dismiss, true); };
  }, []);
  return <>
    <button ref={trigger} type="button" className="action-overflow-trigger" aria-label="Más acciones" title="Más acciones" aria-haspopup="menu" aria-controls={id} aria-expanded={expanded} onClick={show} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); show(); } }}><MoreHorizontal size={21} /></button>
    {createPortal(<div ref={panel} id={id} popover="auto" role="menu" aria-label="Más acciones" className="action-overflow-menu" onToggle={(event) => setExpanded(event.newState === "open")} onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => {
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") event.preventDefault(); close(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}><span className="action-overflow-heading">GESTIONAR CONTENIDO</span>{actions.map(({ label, icon: Icon, disabled, run }) => <button key={label} type="button" role="menuitem" disabled={disabled} onClick={() => { close(); void run(); }}><Icon size={17} /><span>{label}</span></button>)}</div>, document.body)}
  </>;
}
