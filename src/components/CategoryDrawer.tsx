import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Grid2X2, Hash, Search, SlidersHorizontal, X } from "lucide-react";
import type { ContentCategory } from "../lib/types";

interface Props {
  categories: ContentCategory[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

export default function CategoryDrawer({ categories, selected, onSelect, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [closing, setClosing] = useState(false);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (!closing) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    const timer = window.setTimeout(() => closeCallback.current(), delay);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const filtered = categories.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function select(id: string | null) {
    if (closing) return;
    onSelect(id);
    setClosing(true);
  }

  return createPortal(<dialog ref={dialog} className={`category-drawer${closing ? " is-closing" : ""}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); setClosing(true); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setClosing(true);
  }}>
    <header className="category-drawer-header"><span className="section-icon"><SlidersHorizontal size={22} /></span><button type="button" aria-label="Cerrar categorías" className="category-close" onClick={() => setClosing(true)}><X size={19} /></button></header>
    <div className="category-drawer-heading"><span>EXPLORAR CONTENIDO</span><h2 id={titleId}>Categorías</h2><p>Encuentra lo que le falta a tu mundo.</p></div>
    <label className="search-field category-search"><Search size={16} /><input autoFocus aria-label="Buscar categoría" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar categoría…" /></label>
    <nav className="category-nav" aria-label="Categorías de contenido">
      <button type="button" aria-pressed={selected === null} onClick={() => select(null)}><Grid2X2 size={18} /><span>Todas las categorías</span>{selected === null ? <Check size={16} /> : <ChevronRight size={15} />}</button>
      <div className="category-divider" />
      {filtered.map((item) => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => select(item.id)}><Hash size={17} /><span>{item.name.replace(/-/g, " ")}</span>{selected === item.id ? <Check size={16} /> : <ChevronRight size={15} />}</button>)}
      {filtered.length === 0 && <p className="category-no-results">{query ? "No hay categorías con ese nombre." : "Esta fuente no tiene categorías disponibles."}</p>}
    </nav>
    <footer className="category-drawer-footer">{categories.length} categorías <span>Selecciona una para filtrar</span></footer>
  </dialog>, document.body);
}

