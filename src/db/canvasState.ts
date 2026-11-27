import { getToken } from "@/stores/authStore";
import { apiFetch } from "@/lib/session";
import { PersistedAppState, parsePersistedAppState } from "@/lib/persistence";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

function canvasUrl(workspace?: string): string {
  return `${API_BASE}/canvases/mine${workspace ? `?${new URLSearchParams({ workspace })}` : ""}`;
}

export async function fetchRemoteCanvasState(workspace?: string): Promise<PersistedAppState | null> {
  let res: Response;
  try {
    res = await apiFetch(canvasUrl(workspace), { headers: authHeaders(), cache: "no-store" });
  } catch {
    throw new Error("No se pudo cargar el canvas. Comprueba tu conexión e intenta de nuevo.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`No se pudo cargar el canvas (${res.status}). Intenta de nuevo.`);
  let data: { state?: unknown; updatedAt?: string } | null;
  try {
    data = await res.json() as { state?: unknown; updatedAt?: string } | null;
  } catch {
    throw new Error("No se pudo leer el canvas guardado. Intenta cargarlo de nuevo.");
  }
  if (data === null || data.state === null) {
    lastSavedAt.delete(workspace ?? "");
    return null;
  }
  const state = data.state ? parsePersistedAppState(JSON.stringify(data.state)) : null;
  if (!state) throw new Error("El canvas guardado no es válido. No se sobrescribió; intenta cargarlo de nuevo.");
  if (data.updatedAt) lastSavedAt.set(workspace ?? "", data.updatedAt);
  return state;
}

export class CanvasConflictError extends Error {
  constructor() {
    super("El canvas cambió en otra pestaña o dispositivo. Recarga la página para ver la última versión; tus cambios de aquí no se guardaron.");
  }
}

// Version each workspace was loaded or last saved at, sent as baseSavedAt so a stale tab cannot overwrite a newer save.
const lastSavedAt = new Map<string, string>();
// Saves run one after another: an older save can never land after a newer one.
let saveQueue: Promise<unknown> = Promise.resolve();

export function saveRemoteCanvasState(state: PersistedAppState, workspace?: string, options: { keepalive?: boolean } = {}): Promise<void> {
  const run = saveQueue.catch(() => undefined).then(() => putCanvasState(state, workspace, options));
  saveQueue = run;
  return run;
}

async function putCanvasState(state: PersistedAppState, workspace: string | undefined, options: { keepalive?: boolean }): Promise<void> {
  const key = workspace ?? "";
  const baseSavedAt = lastSavedAt.get(key);
  const res = await apiFetch(canvasUrl(workspace), {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(baseSavedAt ? { state, baseSavedAt } : { state }),
    keepalive: options.keepalive,
  });
  if (res.status === 409) throw new CanvasConflictError();
  if (!res.ok) throw new Error(`Error ${res.status} al guardar el canvas`);
  const body = await res.json().catch(() => null) as { savedAt?: string } | null;
  if (body?.savedAt) lastSavedAt.set(key, body.savedAt);
}
