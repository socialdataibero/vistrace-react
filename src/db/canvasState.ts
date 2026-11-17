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
  let data: { state?: unknown } | null;
  try {
    data = await res.json() as { state?: unknown } | null;
  } catch {
    throw new Error("No se pudo leer el canvas guardado. Intenta cargarlo de nuevo.");
  }
  if (data === null || data.state === null) return null;
  const state = data.state ? parsePersistedAppState(JSON.stringify(data.state)) : null;
  if (!state) throw new Error("El canvas guardado no es válido. No se sobrescribió; intenta cargarlo de nuevo.");
  return state;
}

export async function saveRemoteCanvasState(state: PersistedAppState, workspace?: string): Promise<void> {
  const res = await apiFetch(canvasUrl(workspace), {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error(`Error ${res.status} al guardar el canvas`);
}
