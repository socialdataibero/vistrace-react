import { forgetLocalSession, getToken, useAuthStore } from "@/stores/authStore";

import { forgetLocalIbero } from "@/stores/iberoStore";

export const SESSION_EXPIRED_MESSAGE = "Tu sesión expiró o ya no está activa. Inicia sesión de nuevo.";
export const SESSION_MESSAGE_KEY = "vistrace-session-message";

export function endSession(message?: string): void {
  useAuthStore.getState().clearToken();
  if (typeof window === "undefined") return;
  if (message) sessionStorage.setItem(SESSION_MESSAGE_KEY, message);
  window.location.replace(window.location.pathname);
}

export function endLocalSession(message: string): void {
  forgetLocalSession();
  forgetLocalIbero();
  sessionStorage.removeItem("vistrace-handoff");
  sessionStorage.setItem("vistrace-login-required", "1");
  sessionStorage.setItem(SESSION_MESSAGE_KEY, message);
  window.location.replace(window.location.pathname);
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const requestToken = headers.get("Authorization")?.replace(/^Bearer /i, "") ?? null;
  const response = await fetch(input, init);
  if (requestToken && requestToken !== getToken()) throw new Error("La sesión cambió. Inicia sesión de nuevo.");
  if (response.status === 401 && requestToken) {
    if (requestToken && requestToken === getToken()) endSession(SESSION_EXPIRED_MESSAGE);
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  return response;
}
