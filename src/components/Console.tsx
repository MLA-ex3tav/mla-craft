import { useSectionSearch, matchesSearch } from "../lib/sectionSearch";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { SendHorizontal, Terminal as TerminalIcon, Eraser, ArrowDownToLine, CircleHelp } from "lucide-react";
import { sendServerCommand } from "../lib/api";
import { ensureServerLogs, serverLogs } from "../lib/serverLogs";

interface Props {
  id: string;
  running: boolean;
}

function Console({ id, running }: Props) {
  const { query } = useSectionSearch();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState("");

  useEffect(() => {
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      lineHeight: 1.5,
      fontFamily:
        '"JetBrains Mono", "Cascadia Code", ui-monospace, monospace',
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
      theme: {
        background: "#f7faf7",
        foreground: "#284733",
        cursor: "#237b4b",
        selectionBackground: "#cde7d6",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (containerRef.current) {
      term.open(containerRef.current);
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    }
    termRef.current = term;
    term.writeln("\x1b[32mMLA Server · Registro del servidor\x1b[0m");
    term.writeln("Los nuevos eventos del servidor aparecerán aquí.\r\n");

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    if (containerRef.current) observer.observe(containerRef.current);

    // Reproduce el historial acumulado y sigue escribiendo lo nuevo.
    ensureServerLogs();
    let written = 0;
    const renderBuffer = () => {
      const { lines, total } = serverLogs.snapshot(id);
      const start = total - lines.length;
      if (written < start) {
        // El buffer rotó y se perdieron líneas que aún no habíamos escrito.
        term.reset();
        for (const line of lines) if (matchesSearch(line.replace(/\x1b\[[0-9;]*m/g, ""), query)) term.writeln(line);
      } else {
        for (let index = written - start; index < lines.length; index += 1) {
          if (index >= 0 && matchesSearch(lines[index].replace(/\x1b\[[0-9;]*m/g, ""), query)) term.writeln(lines[index]);
        }
      }
      written = total;
    };
    renderBuffer();
    const unsubscribe = serverLogs.subscribe(id, renderBuffer);

    return () => {
      unsubscribe();
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
    };
  }, [id, query]);

  async function submit() {
    const value = command.trim();
    if (!value || !running) return;
    termRef.current?.writeln(`\x1b[36m> ${value}\x1b[0m`);
    setCommand("");
    try {
      await sendServerCommand(id, value);
    } catch {
      termRef.current?.writeln("\x1b[31mNo se pudo enviar el comando.\x1b[0m");
    }
  }

  return (
    <div className="console-page page-enter">
      <div className="console-heading"><div className="section-title"><TerminalIcon size={23} /><div><h2>Consola del servidor</h2><p>Eventos, actividad y comandos de tu mundo.</p></div></div></div>
      <div className="console-window">
      <div className="console-toolbar"><span><TerminalIcon size={15} /> Registro de actividad</span><div><button type="button" onClick={() => termRef.current?.scrollToBottom()} title="Ir al último evento"><ArrowDownToLine size={15} /><span>Último evento</span></button><button type="button" onClick={() => termRef.current?.clear()} title="Limpiar vista de consola"><Eraser size={15} /><span>Limpiar vista</span></button></div></div>
      <div className="console-terminal"><div ref={containerRef} className="console-terminal-host" /></div>
      <div className="console-command">
        <span className="command-prompt" aria-hidden="true">›</span>
        <input
          ref={commandRef}
          aria-label="Comando del servidor"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={!running}
          placeholder={running ? "Escribe un comando…" : "Servidor detenido"}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          aria-label="Enviar comando"
          disabled={!running || !command.trim()}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm disabled:opacity-40"
        >
          <SendHorizontal size={15} /> Enviar
        </button>
      </div>
      </div>
      <div className="console-hints"><span><CircleHelp size={15} /> Preparar un comando</span>{["help", "list", "seed"].map((value) => <button type="button" key={value} disabled={!running} onClick={() => { setCommand(value); commandRef.current?.focus(); }}>{value}</button>)}<small>Enter para enviar</small></div>
    </div>
  );
}

export default Console;
