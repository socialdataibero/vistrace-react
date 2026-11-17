import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteCanvasState, saveRemoteCanvasState } from "./canvasState";
import { iberoWorkspace } from "@/stores/iberoStore";
import { canvasFixture, iberoContext } from "@/test/iberoFixtures";

afterEach(() => vi.unstubAllGlobals());

describe("remote canvas isolation", () => {
  it("loads and saves the same dataset workspace and leaves standalone requests on the default", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ state: canvasFixture() })));
    vi.stubGlobal("fetch", fetchMock);
    const workspace = iberoWorkspace(iberoContext());
    await fetchRemoteCanvasState(workspace);
    await saveRemoteCanvasState(canvasFixture(), workspace);
    await fetchRemoteCanvasState();
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("workspace")).toBe("ibero:organization:dataset-a");
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
    expect(new URL(fetchMock.mock.calls[2][0]).search).toBe("");
    expect(iberoWorkspace(iberoContext("dataset-b"))).not.toBe(workspace);
  });

  it.each([
    [404, ""],
    [200, "null"],
    [200, JSON.stringify({ state: null })],
  ])("starts blank only for a missing canvas (%s %s)", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
    await expect(fetchRemoteCanvasState()).resolves.toBeNull();
  });

  it.each([403, 500, 503])("rejects a failed load instead of returning a blank canvas (%s)", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchRemoteCanvasState()).rejects.toThrow("No se pudo cargar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects network failures and malformed saved state", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchRemoteCanvasState()).rejects.toThrow("No se pudo cargar");
    await expect(fetchRemoteCanvasState()).rejects.toThrow("no es válido");
  });
});
