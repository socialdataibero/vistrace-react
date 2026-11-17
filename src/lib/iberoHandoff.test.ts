import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { receiveIberoHandoff } from "./iberoHandoff";
import { useAuthStore } from "@/stores/authStore";
import { useIberoStore } from "@/stores/iberoStore";
import { canvasFixture, iberoContext, sessionToken } from "@/test/iberoFixtures";

beforeEach(() => {
  useAuthStore.getState().clearToken();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

describe("fresh Ibero handoff", () => {
  it("imports with the incoming identity and replaces the full Ibero context", async () => {
    const previous = sessionToken("old-user");
    const incoming = sessionToken("new-user");
    useAuthStore.getState().setSession(previous, { username: "old-user" }, "local");
    useIberoStore.getState().setContext(iberoContext("old-dataset"));
    useIberoStore.getState().registerTable("stale", { datasetId: "old-dataset", resourceId: "old-resource" });
    const context = iberoContext("incoming-dataset");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token: incoming, user: { username: "new-user", name: "New name" }, iberoContext: context }))
      .mockResolvedValueOnce(json({ tableName: "data_2" }));
    vi.stubGlobal("fetch", fetchMock);
    await receiveIberoHandoff(new URLSearchParams({ handoff: "fresh", resource_url: "https://ibero.test/resources/11111111-1111-4111-8111-111111111111/download", resource_name: "data" }), vi.fn(), vi.fn());
    expect(useAuthStore.getState()).toMatchObject({ token: incoming, user: { name: "New name" }, source: "ibero" });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${incoming}`);
    expect(useIberoStore.getState().context).toEqual(context);
    expect(useIberoStore.getState().tables).toEqual({ data_2: { datasetId: "incoming-dataset", resourceId: "11111111-1111-4111-8111-111111111111" } });
  });

  it("rejects an invalid handoff instead of importing under the previous session", async () => {
    useAuthStore.getState().setSession(sessionToken("old-user"), { username: "old-user" }, "local");
    const fetchMock = vi.fn().mockResolvedValue(json({ message: "Invalid handoff" }, 403));
    vi.stubGlobal("fetch", fetchMock);
    await expect(receiveIberoHandoff(new URLSearchParams({ handoff: "rejected" }), vi.fn(), vi.fn())).rejects.toThrow("No se pudo validar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses renamed tables in a saved canvas instead of the old names", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ token: sessionToken("incoming"), iberoContext: iberoContext(), canvas: { state: canvasFixture(), tables: [{ tableName: "data", resourceId: "resource-a", downloadUrl: "https://ibero.test/source" }] } }))
      .mockResolvedValueOnce(json({ tableName: "data_2" }));
    vi.stubGlobal("fetch", fetchMock);
    const pipeline = vi.fn();
    await receiveIberoHandoff(new URLSearchParams({ handoff: "fresh", pipeline: "ignored" }), pipeline, vi.fn());
    const incoming = JSON.parse(sessionStorage.getItem("vistrace-handoff")!);
    expect(incoming.dag.nodes.source.config.tableName).toBe("data_2");
    expect(incoming.canvas.pages[0].iberoAnalysisId).toBe("analysis-a");
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("fails visibly when importing a resource fails instead of using a requested table name", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ token: sessionToken("incoming"), iberoContext: iberoContext() }))
      .mockResolvedValueOnce(json({ message: "Recurso no disponible" }, 403)));
    await expect(receiveIberoHandoff(new URLSearchParams({ handoff: "fresh", resource_url: "https://ibero.test/source", resource_name: "data" }), vi.fn(), vi.fn())).rejects.toThrow("Recurso no disponible");
    expect(sessionStorage.getItem("vistrace-handoff")).toBeNull();
  });
});
