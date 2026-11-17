import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import CanvasApp from "./CanvasApp";
import { canvasFixture, iberoContext } from "@/test/iberoFixtures";
import { canvasStoreApi } from "@/stores/canvasStore";
import { useIberoStore } from "@/stores/iberoStore";

vi.mock("@/hooks/useDuckDB", () => ({ useDuckDB: () => ({ ready: true, loading: false, error: null }) }));
vi.mock("./InfiniteCanvas", () => ({ default: () => <div>Canvas surface</div> }));

beforeEach(() => {
  sessionStorage.clear();
  useIberoStore.getState().setContext(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("canvas load failure", () => {
  it("preserves Ibero credentials, mappings and snapshots during a successful startup", async () => {
    const context = iberoContext();
    useIberoStore.getState().setContext(context);
    useIberoStore.getState().registerTable("data", { datasetId: context.datasetId, resourceId: "resource-a" });
    const ibero = localStorage.getItem("vistrace-ibero");
    const snapshots = [{ id: "snapshot", timestamp: "saved", data: JSON.stringify(canvasFixture()) }];
    localStorage.setItem("vistrace-snapshots", JSON.stringify(snapshots));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("null")));
    render(<CanvasApp />);
    expect(await screen.findByText("Canvas surface")).toBeInTheDocument();
    expect(localStorage.getItem("vistrace-ibero")).toBe(ibero);
    expect(JSON.parse(localStorage.getItem("vistrace-snapshots")!)).toEqual(snapshots);
    expect(canvasStoreApi.getState().snapshots).toEqual(snapshots);
  });

  it.each(["http", "network"])("keeps the saved canvas and blocks autosave after a %s failure", async (failure) => {
    const original = canvasFixture();
    canvasStoreApi.setState({ title: original.canvas.title, pages: original.canvas.pages });
    sessionStorage.setItem("vistrace-handoff", JSON.stringify(original));
    const fetchMock = vi.fn();
    if (failure === "http") fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    else fetchMock.mockRejectedValue(new Error("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    render(<CanvasApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el canvas");
    expect(screen.queryByText("Canvas surface")).not.toBeInTheDocument();
    expect(canvasStoreApi.getState().pages).toEqual(original.canvas.pages);
    expect(sessionStorage.getItem("vistrace-handoff")).not.toBeNull();
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
