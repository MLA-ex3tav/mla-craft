import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export default function Select({ value, onChange, children, disabled, className = "", "aria-label": label }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const options = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child) || child.type !== "option") return [];
    const text = Children.toArray(child.props.children).join("");
    return [{ value: String(child.props.value ?? text), label: text, disabled: child.props.disabled }];
  });
  const selected = options.findIndex((option) => option.value === value);

  function show() {
    if (disabled || trigger.current?.matches(":disabled") || !options.length) return;
    setActive(selected >= 0 ? selected : Math.max(0, options.findIndex((option) => !option.disabled)));
    search.current = { text: "", time: 0 };
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled || disabled || trigger.current?.matches(":disabled")) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }
  function move(delta: number) {
    for (let step = 1; step <= options.length; step++) {
      const next = (active + delta * step + options.length) % options.length;
      if (!options[next].disabled) { setActive(next); return; }
    }
  }

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < 200 && above > below;
      const maxHeight = Math.min(280, Math.max(60, upwards ? above : below));
      const height = Math.min(maxHeight, options.length * 38 + 12);
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 24);
      setPosition({ top: upwards ? rect.top - height - 6 : rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight });
    }
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    }
    function onScroll(event: Event) {
      if (!menu.current?.contains(event.target as Node)) place();
    }
    place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled || options.length === 0} className={`styled-select ${className}`} data-open={open} onClick={() => open ? setOpen(false) : show()} onBlur={() => setOpen(false)} onKeyDown={(event) => {
      if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
      if (event.key === "Tab") { setOpen(false); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (!open) { show(); return; }
        if (event.key === "ArrowDown") move(1);
        else if (event.key === "ArrowUp") move(-1);
        else if (event.key === "Home") setActive(Math.max(0, options.findIndex((option) => !option.disabled)));
        else if (event.key === "End") { for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) { setActive(i); break; } }
        else choose(active);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const now = Date.now();
        const text = now - search.current.time < 700 ? search.current.text + event.key : event.key;
        search.current = { text: text.toLowerCase(), time: now };
        const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(text.toLowerCase()));
        if (!open) show();
        if (match >= 0) setActive(match);
      }
    }}><span className="styled-select-value">{options[selected]?.label ?? (options.length ? "Seleccionar…" : "Sin opciones")}</span><ChevronDown size={16} className="select-chevron" aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label ?? "Opciones"} className="select-menu" style={position} onMouseDown={(event) => event.preventDefault()}>{options.map((option, index) => <div key={`${option.value}-${index}`} id={`${id}-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} data-index={index} data-active={active === index} className="select-option" onMouseEnter={() => !option.disabled && setActive(index)} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}</div>)}</div>, document.body)}
  </>;
}
