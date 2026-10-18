// Selector de carpeta basado en el servidor (para el panel web), resuelto por
// el componente <FolderPicker /> montado en la raíz.

interface FolderRequest {
  startPath?: string;
}

let active: FolderRequest | null = null;
let resolver: ((value: string | null) => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeFolder(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function folderSnapshot(): FolderRequest | null {
  return active;
}

export function requestFolder(startPath?: string): Promise<string | null> {
  resolver?.(null);
  active = { startPath };
  emit();
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export function resolveFolder(value: string | null) {
  const pending = resolver;
  resolver = null;
  active = null;
  emit();
  pending?.(value);
}
