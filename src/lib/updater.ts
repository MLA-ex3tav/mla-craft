// Actualizaciones automáticas desde GitHub Releases (Tauri updater).
//
// - La app comprueba si hay una versión nueva al arrancar.
// - El manifiesto vive en `releases/latest/download/latest.json` del repo.
// - La descarga se firma con la clave del updater (minisign).
//
// En el panel web no hay updater: el estado queda en "no disponible".

import { useSyncExternalStore } from "react";
import { isDesktop } from "./transport";

const SKIP_KEY = "mla-skip-update";
const RELEASES_URL = "https://github.com/MLA-ex3tav/mla-craft/releases/latest";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "current"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  currentVersion: string | null;
  notes: string | null;
  date: string | null;
  progress: number;
  downloaded: number;
  total: number;
  error: string | null;
  /** El usuario pidió no volver a ver esta versión. */
  skipped: boolean;
}

interface PendingUpdate {
  version: string;
  body?: string | null;
  date?: string | null;
  downloadAndInstall: (
    onEvent: (event: {
      event: "Started" | "Progress" | "Finished";
      data: { contentLength?: number; chunkLength?: number };
    }) => void,
  ) => Promise<void>;
}

const initial: UpdateState = {
  status: "idle",
  version: null,
  currentVersion: null,
  notes: null,
  date: null,
  progress: 0,
  downloaded: 0,
  total: 0,
  error: null,
  skipped: false,
};

let state: UpdateState = initial;
let pending: PendingUpdate | null = null;
const listeners = new Set<() => void>();

function emit(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function readSkipped(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function subscribeUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUpdateState(): UpdateState {
  return state;
}

/** Hook de React con el estado actual del updater. */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribeUpdates, getUpdateState, getUpdateState);
}

export function releasesUrl(): string {
  return RELEASES_URL;
}

/** Comprueba si hay una versión nueva. */
export async function checkForUpdate(options: { silent?: boolean } = {}): Promise<void> {
  if (!isDesktop) {
    emit({ status: "idle", error: null });
    return;
  }
  if (state.status === "checking" || state.status === "downloading") return;

  emit({ status: "checking", error: null });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      pending = null;
      emit({ status: "current", version: null, notes: null, date: null, progress: 0 });
      return;
    }

    pending = update as unknown as PendingUpdate;
    const skipped = readSkipped() === update.version;
    emit({
      status: "available",
      version: update.version,
      currentVersion: update.currentVersion ?? null,
      notes: update.body ?? null,
      date: update.date ?? null,
      skipped,
      progress: 0,
      downloaded: 0,
      total: 0,
    });
  } catch (error) {
    emit({ status: "error", error: message(error) });
    if (!options.silent) return;
  }
}

/** Descarga e instala la versión detectada. */
export async function installUpdate(): Promise<void> {
  if (!pending) {
    await checkForUpdate();
    if (!pending) return;
  }

  const update = pending;
  emit({ status: "downloading", progress: 0, downloaded: 0, total: 0, error: null });

  let downloaded = 0;
  let total = 0;

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        emit({ total });
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength ?? 0;
        const progress = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;
        emit({ downloaded, progress });
      } else if (event.event === "Finished") {
        emit({ progress: 100, downloaded: total || downloaded });
      }
    });
    emit({ status: "ready", progress: 100 });
  } catch (error) {
    emit({ status: "error", error: message(error) });
  }
}

/** Reinicia la app para aplicar la actualización. */
export async function restartForUpdate(): Promise<void> {
  if (!isDesktop) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/** Oculta esta versión hasta que haya otra. */
export function skipVersion() {
  if (!state.version) return;
  try {
    localStorage.setItem(SKIP_KEY, state.version);
  } catch {
    /* almacenamiento no disponible */
  }
  emit({ skipped: true });
}

/** Vuelve a mostrar una versión que se había ocultado. */
export function unskipVersion() {
  try {
    localStorage.removeItem(SKIP_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
  emit({ skipped: false });
}

/** Arranca la comprobación automática (una vez por sesión). */
let booted = false;
export function startUpdateCheck() {
  if (!isDesktop || booted) return;
  booted = true;
  window.setTimeout(() => {
    void checkForUpdate({ silent: true });
  }, 4000);
}
