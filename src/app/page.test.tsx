import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";
import { useAuthStore } from "@/stores/authStore";
import { useIberoStore } from "@/stores/iberoStore";
import { iberoContext, sessionToken } from "@/test/iberoFixtures";

vi.mock("next/dynamic", () => ({ default: () => () => <div>Canvas mounted</div> }));

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/?handoff=fresh");
  useAuthStore.getState().setSession(sessionToken("old-user"), { username: "old-user", name: "Old profile" }, "local");
  useIberoStore.getState().setContext(iberoContext("old-dataset"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("handoff entry screen", () => {
  it.each(["rejected", "network"])("drops the previous session and shows a Spanish error on a %s handoff", async (failure) => {
    const fetchMock = vi.fn();
    if (failure === "rejected") fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    else fetchMock.mockRejectedValue(new Error("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent(failure === "rejected" ? "No se pudo validar el acceso" : "No se pudo abrir el análisis");
    expect(screen.queryByText("Canvas mounted")).not.toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useIberoStore.getState().context).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens the canvas only after accepting the incoming session and context", async () => {
    const token = sessionToken("new-user");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ token, user: { username: "new-user", name: "New profile" }, ibero: iberoContext("new-dataset") }))));
    render(<Home />);
    expect(await screen.findByText("Canvas mounted")).toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ token, user: { name: "New profile" }, source: "ibero" });
    expect(useIberoStore.getState().context?.datasetId).toBe("new-dataset");
  });
});
