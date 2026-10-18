// Capa de transporte: funciona igual en la app de escritorio (Tauri) y en el
// panel web (servidor headless) usando REST + WebSocket.

export const isDesktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const TOKEN_KEY = "mla-token";

let token = "";
try {
  token = localStorage.getItem(TOKEN_KEY) ?? "";
} catch {
  token = "";
}

const authListeners = new Set<() => void>();

export function subscribeAuth(listener: () => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function notifyAuth() {
  authListeners.forEach((listener) => listener());
}

export function isAuthenticated(): boolean {
  return isDesktop || token.length > 0;
}

export function getToken(): string {
  return token;
}

export function setToken(value: string) {
  token = value;
  try {
    localStorage.setItem(TOKEN_KEY, value);
  } catch {
    /* almacenamiento no disponible */
  }
  notifyAuth();
}

export function clearToken() {
  token = "";
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
  notifyAuth();
}

export async function loginRequest(username: string, password: string): Promise<void> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error("Usuario o contraseña incorrectos.");
  }
  const data = (await response.json()) as { token: string };
  setToken(data.token);
  ensureSocket();
}

export async function logoutRequest(): Promise<void> {
  try {
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    /* ignorar */
  }
  clearToken();
}

/// Invoca un comando en el host activo.
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktop) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(command, args);
  }
  const response = await fetch("/api/invoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ command, args: args ?? {} }),
  });
  if (response.status === 401) {
    clearToken();
    throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Error ${response.status}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

type Handler = (payload: unknown) => void;
const eventHandlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

export function ensureSocket() {
  if (isDesktop || !token) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(
    `${protocol}://${window.location.host}/api/events?token=${encodeURIComponent(token)}`,
  );
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as { event: string; payload: unknown };
      eventHandlers.get(message.event)?.forEach((handler) => handler(message.payload));
    } catch {
      /* mensaje no válido */
    }
  };
  socket.onclose = () => {
    socket = null;
    if (isAuthenticated()) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(ensureSocket, 2000);
    }
  };
}

/// Se suscribe a un evento del host activo.
export async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (isDesktop) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    return tauriListen<T>(event, (message) => handler(message.payload));
  }
  ensureSocket();
  let set = eventHandlers.get(event);
  if (!set) {
    set = new Set();
    eventHandlers.set(event, set);
  }
  const typed = handler as Handler;
  set.add(typed);
  return () => {
    set!.delete(typed);
  };
}

/// Abre un selector de carpeta (nativo en escritorio, modal en web).
export async function openDirectory(): Promise<string | null> {
  if (isDesktop) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }
  const { requestFolder } = await import("./folderPicker");
  return requestFolder();
}

/// Abre un selector de archivo (solo escritorio).
export async function openFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (isDesktop) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ multiple: false, filters });
    return typeof selected === "string" ? selected : null;
  }
  return null;
}

/// Diálogo "guardar como" (solo escritorio).
export async function saveFile(defaultPath?: string): Promise<string | null> {
  if (isDesktop) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({ defaultPath });
    return typeof selected === "string" ? selected : null;
  }
  return null;
}

export async function openPath(path: string): Promise<void> {
  if (isDesktop) {
    const { openPath: tauriOpenPath } = await import("@tauri-apps/plugin-opener");
    return tauriOpenPath(path);
  }
  throw new Error("Abrir carpetas no está disponible en el panel web.");
}

export async function openUrl(url: string): Promise<void> {
  if (isDesktop) {
    const { openUrl: tauriOpenUrl } = await import("@tauri-apps/plugin-opener");
    return tauriOpenUrl(url);
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
