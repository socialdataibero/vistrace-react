import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSessionLifecycle } from "./useSessionLifecycle";
import { endLocalSession, endSession } from "@/lib/session";
import { useAuthStore } from "@/stores/authStore";
import { sessionToken } from "@/test/iberoFixtures";

vi.mock("@/lib/session", () => ({ endLocalSession: vi.fn(), endSession: vi.fn(), SESSION_EXPIRED_MESSAGE: "Sesión expirada" }));

beforeEach(() => {
  vi.mocked(endLocalSession).mockClear();
  vi.mocked(endSession).mockClear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  useAuthStore.getState().clearToken();
});

describe("session lifecycle", () => {
  it("rejects an expired JWT before mounting the canvas", () => {
    useAuthStore.getState().setSession(sessionToken("a", Date.now() / 1000 - 10), { username: "a" }, "local");
    const { result } = renderHook(useSessionLifecycle);
    expect(result.current).toBe(false);
    expect(endSession).toHaveBeenCalledWith("Sesión expirada");
  });

  it("responds to another tab's logout but ignores unrelated storage changes", async () => {
    useAuthStore.getState().setSession(sessionToken("a"), { username: "a" }, "local");
    const { result } = renderHook(useSessionLifecycle);
    await waitFor(() => expect(result.current).toBe(true));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "vistrace-snapshots", newValue: "[]" })));
    expect(endLocalSession).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "vistrace-auth", newValue: JSON.stringify({ state: { token: null } }) })));
    expect(endLocalSession).toHaveBeenCalledWith("La sesión cambió en otra pestaña. Inicia sesión de nuevo.");
  });
});
