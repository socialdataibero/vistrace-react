import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import IberoPublishDialog from "./IberoPublishDialog";
import { useIberoStore } from "@/stores/iberoStore";
import { canvasFixture, iberoContext } from "@/test/iberoFixtures";
import { publishCanvasToIbero } from "@/lib/iberoPublish";

vi.mock("@/lib/iberoPublish", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/iberoPublish")>(),
  publishCanvasToIbero: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(publishCanvasToIbero).mockReset();
  useIberoStore.getState().setContext(iberoContext());
  useIberoStore.getState().registerTable("data", { datasetId: "dataset-a", resourceId: "resource-a" });
});

function showDialog(state = canvasFixture()) {
  state.canvas.pages.push({ id: "page-b", name: "Another page", order: 1 });
  state.dag.nodes.other = { ...state.dag.nodes.result, id: "other", pageId: "page-b" };
  const onPublished = vi.fn();
  render(<IberoPublishDialog nodes={state.dag.nodes} pages={state.canvas.pages} currentPageId="page-a" selectedNodeId="other" buildState={() => state} onPublished={onPublished} onClose={vi.fn()} />);
  return { state, onPublished };
}

describe("publish current Ibero analysis", () => {
  it("offers only results from the current page, even when another page's result is selected", () => {
    showDialog();
    expect(screen.getAllByRole("option", { name: /Tabla/ })).toHaveLength(1);
    expect(screen.getByLabelText("Nodo con el resultado")).toHaveValue("result");
  });

  it("prefills existing metadata and sends it to the current dataset and update target", async () => {
    vi.mocked(publishCanvasToIbero).mockResolvedValue({ id: "analysis-a", title: "Existing analysis", slug: "custom-slug", status: "READY" });
    const { onPublished } = showDialog();
    expect(screen.getByLabelText("Slug")).toHaveValue("custom-slug");
    expect(screen.getByLabelText("Carpeta")).toHaveValue("custom-folder");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Existing description");
    expect(screen.getByLabelText("Visibilidad")).toHaveValue("PUBLIC");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Changed title" } });
    expect(screen.getByLabelText("Slug")).toHaveValue("custom-slug");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar análisis" }));
    await waitFor(() => expect(publishCanvasToIbero).toHaveBeenCalledOnce());
    expect(vi.mocked(publishCanvasToIbero).mock.calls[0][0]).toMatchObject({
      context: { analysisId: "analysis-a", datasetId: "dataset-a" },
      slug: "custom-slug", folder: "custom-folder", description: "Existing description", visibility: "PUBLIC", update: true,
    });
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith("analysis-a"));
    expect(screen.getByText(/al recargar la página del dataset/)).toBeInTheDocument();
  });

  it("refuses unmapped sources instead of using the context resource as a fallback", () => {
    useIberoStore.getState().registerTable("data", { datasetId: "another-dataset", resourceId: "unrelated" });
    showDialog();
    expect(screen.getByText(/No se puede guardar/)).toHaveTextContent("data");
    const button = screen.getByRole("button", { name: "Actualizar análisis" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(publishCanvasToIbero).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("no están vinculadas al dataset actual");
  });

  it("refuses a raw SQL source that is outside the current dataset", () => {
    const state = canvasFixture();
    state.dag.nodes.query = { ...state.dag.nodes.source, id: "query", type: "sql", config: { query: 'SELECT * FROM data JOIN unrelated ON true', autoRun: true } };
    showDialog(state);
    expect(screen.getByText(/No se puede guardar/)).toHaveTextContent("unrelated");
    expect(screen.getByRole("button", { name: "Actualizar análisis" })).toBeDisabled();
  });

  it("keeps creation defaults when switching to a new analysis", () => {
    showDialog();
    fireEvent.click(screen.getByRole("radio", { name: "Crear uno nuevo" }));
    expect(screen.getByLabelText("Slug")).toHaveValue("existing-analysis");
    expect(screen.getByLabelText("Carpeta")).toHaveValue("vistrace");
    expect(screen.getByLabelText("Descripción")).toHaveValue("");
    expect(screen.getByLabelText("Visibilidad")).toHaveValue("PRIVATE");
  });
});
