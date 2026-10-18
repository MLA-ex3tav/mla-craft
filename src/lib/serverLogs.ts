import { listen } from "./transport";
import type { LogLine } from "./types";

const MAX_LINES = 5000;
const EMPTY: string[] = [];

interface Buffer {
  lines: string[];
  total: number;
}

const buffers = new Map<string, Buffer>();
const listeners = new Map<string, Set<() => void>>();
let started = false;

function emit(id: string) {
  listeners.get(id)?.forEach((listener) => listener());
}

function push(id: string, line: string) {
  let buffer = buffers.get(id);
  if (!buffer) {
    buffer = { lines: [], total: 0 };
    buffers.set(id, buffer);
  }
  buffer.lines.push(line);
  buffer.total += 1;
  if (buffer.lines.length > MAX_LINES) {
    buffer.lines.splice(0, buffer.lines.length - MAX_LINES);
  }
  emit(id);
}

/// Empieza a capturar los logs del servidor a nivel global (una sola vez).
export function ensureServerLogs() {
  if (started) return;
  started = true;
  listen<LogLine>("server-log", (line) => {
    push(line.id, line.line);
  }).catch(() => {
    started = false;
  });
}

/// Buffer de logs en memoria por servidor, con contador total acumulado.
export const serverLogs = {
  snapshot(id: string): { lines: string[]; total: number } {
    const buffer = buffers.get(id);
    return buffer ? { lines: buffer.lines, total: buffer.total } : { lines: EMPTY, total: 0 };
  },
  subscribe(id: string, listener: () => void): () => void {
    let set = listeners.get(id);
    if (!set) {
      set = new Set();
      listeners.set(id, set);
    }
    set.add(listener);
    const bucket = set;
    return () => {
      bucket.delete(listener);
    };
  },
};
