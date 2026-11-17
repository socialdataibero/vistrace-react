import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, endLocalSession, SESSION_EXPIRED_MESSAGE, SESSION_MESSAGE_KEY } from "./session";
import { useAuthStore } from "@/stores/authStore";
import { useIberoStore } from "@/stores/iberoStore";
import { iberoContext, sessionToken } from "@/test/iberoFixtures";

beforeEach(() => {
  useAuthStore.getState().clearToken();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("API session invalidation", () => {
  it("clears the session and Ibero credentials and redirects to login with a Spanish message on 401", async () => {
    const token = sessionToken("a");
    useAuthStore.getState().setSession(token, { username: "a" }, "local");
    useIberoStore.getState().setContext(iberoContext());
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/", replace } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(apiFetch("https://api.test/query/execute", { headers: { Authorization: `Bearer ${token}` } })).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useIberoStore.getState().context).toBeNull();
    expect(replace).toHaveBeenCalledWith("/");
    expect(sessionStorage.getItem(SESSION_MESSAGE_KEY)).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it("does not invalidate a replacement session when an old request returns 401", async () => {
    const oldToken = sessionToken("a");
    useAuthStore.getState().setSession(sessionToken("b"), { username: "b" }, "local");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(apiFetch("https://api.test/tables", { headers: { Authorization: `Bearer ${oldToken}` } })).rejects.toThrow();
    expect(useAuthStore.getState().user?.username).toBe("b");
  });

  it("reloads a logged-out tab without overwriting a newer shared login", () => {
    useAuthStore.getState().setSession(sessionToken("a"), { username: "a" }, "local");
    const shared = JSON.stringify({ state: { token: sessionToken("b") } });
    localStorage.setItem("vistrace-auth", shared);
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/", replace } });
    endLocalSession("La sesión cambió en otra pestaña.");
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem("vistrace-auth")).toBe(shared);
    expect(sessionStorage.getItem("vistrace-login-required")).toBe("1");
    expect(replace).toHaveBeenCalledWith("/");
  });
});
