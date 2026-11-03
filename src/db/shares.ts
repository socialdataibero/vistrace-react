
import { getToken } from "@/stores/authStore";
import { PersistedAppState, parsePersistedAppState } from "@/lib/persistence";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

function shareCacheKey(token: string): string {
  return `vistrace-share-${token}`;
}

export async function createShare(snapshot: PersistedAppState): Promise<{ token: string; url: string }> {
  const authToken = getToken();
  const res = await fetch(`${API_BASE}/shares`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ snapshot }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `Error ${res.status} al crear el enlace`);
  }
  const { token } = (await res.json()) as { token: string };
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("share", token);
  return { token, url: url.toString() };
}
export async function fetchSharedView(token: string): Promise<PersistedAppState | null> {
  const cached = sessionStorage.getItem(shareCacheKey(token));
  if (cached) return parsePersistedAppState(cached);

  const res = await fetch(`${API_BASE}/shares/${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { snapshot?: unknown };
  if (!data.snapshot) return null;

  const raw = JSON.stringify(data.snapshot);
  sessionStorage.setItem(shareCacheKey(token), raw);
  return parsePersistedAppState(raw);
}
