import { beforeEach, describe, expect, it } from "vitest";
import { forgetLocalSession, isTokenUsable, useAuthStore } from "./authStore";
import { forgetLocalIbero, useIberoStore } from "./iberoStore";
import { iberoContext, sessionToken } from "@/test/iberoFixtures";

beforeEach(() => {
  useAuthStore.getState().clearToken();
  sessionStorage.clear();
});

describe("session ownership", () => {
  it("replaces the token and profile on a fresh handoff for the same user and preserves snapshots", () => {
    useAuthStore.getState().setSession(sessionToken("a"), { username: "a", name: "Old" }, "local");
    localStorage.setItem("vistrace-snapshots", "saved snapshots");
    useIberoStore.getState().setContext(iberoContext());
    const fresh = sessionToken("a", Date.now() / 1000 + 7200);
    useAuthStore.getState().setSession(fresh, { username: "a", name: "Incoming" }, "ibero");
    expect(useAuthStore.getState()).toMatchObject({ token: fresh, user: { name: "Incoming" }, source: "ibero" });
    expect(localStorage.getItem("vistrace-snapshots")).toBe("saved snapshots");
    expect(useIberoStore.getState().context?.datasetId).toBe("dataset-a");
  });

  it("clears only app data when the user changes or logs out", () => {
    useAuthStore.getState().setSession(sessionToken("a"), { username: "a" }, "local");
    localStorage.setItem("other-app", "keep");
    localStorage.setItem("vistrace-snapshots", "private");
    sessionStorage.setItem("vistrace-handoff", "private");
    useIberoStore.getState().setContext(iberoContext());
    useAuthStore.getState().setSession(sessionToken("b"), { username: "b" }, "local");
    expect(localStorage.getItem("vistrace-snapshots")).toBeNull();
    expect(sessionStorage.getItem("vistrace-handoff")).toBeNull();
    expect(useIberoStore.getState().context).toBeNull();
    expect(localStorage.getItem("other-app")).toBe("keep");
    useAuthStore.getState().clearToken();
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem("other-app")).toBe("keep");
  });

  it("drops another tab's in-memory identity without overwriting the new shared session", () => {
    useAuthStore.getState().setSession(sessionToken("a"), { username: "a" }, "ibero");
    useIberoStore.getState().setContext(iberoContext());
    const sharedAuth = JSON.stringify({ state: { token: sessionToken("b"), user: { username: "b" } } });
    localStorage.setItem("vistrace-auth", sharedAuth);
    const sharedIbero = localStorage.getItem("vistrace-ibero");
    forgetLocalSession();
    forgetLocalIbero();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useIberoStore.getState().context).toBeNull();
    expect(localStorage.getItem("vistrace-auth")).toBe(sharedAuth);
    expect(localStorage.getItem("vistrace-ibero")).toBe(sharedIbero);
  });
});

describe("JWT expiry", () => {
  it("rejects expired and malformed tokens and accepts a current base64url JWT", () => {
    expect(isTokenUsable(sessionToken("a", Date.now() / 1000 - 1))).toBe(false);
    expect(isTokenUsable("invalid")).toBe(false);
    expect(isTokenUsable(sessionToken("a").replace(/\+/g, "-").replace(/\//g, "_"))).toBe(true);
  });
});
