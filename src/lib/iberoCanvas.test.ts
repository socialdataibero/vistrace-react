import { describe, expect, it } from "vitest";
import { canvasFixture } from "@/test/iberoFixtures";
import { prepareIberoCanvas, replaceIberoPages } from "./iberoCanvas";

describe("incoming analysis canvas", () => {
  it("replaces saved wiring, positions, frames and metadata even when node configurations match", () => {
    const base = canvasFixture();
    base.canvas.pages.push({ id: "other", name: "Keep this page", order: 1 });
    base.dag.nodes.other = { ...base.dag.nodes.source, id: "other", pageId: "other" };
    base.nodePositions.other = { x: 7, y: 8 };
    const state = canvasFixture();
    state.nodePositions.source = { x: 900, y: 800 };
    state.canvas.pages[0].name = "Incoming page";
    state.dag.edges = [];
    state.frames![0].name = "Incoming frame";
    const incoming = prepareIberoCanvas(state, {}, "analysis-a");
    const merged = replaceIberoPages(base, incoming);
    expect(merged.canvas.pages.map((page) => page.name)).toEqual(["Keep this page", "Incoming page"]);
    expect(merged.nodePositions.source).toEqual({ x: 900, y: 800 });
    expect(merged.nodePositions.other).toEqual({ x: 7, y: 8 });
    expect(merged.dag.edges).toEqual([]);
    expect(merged.frames?.map((frame) => frame.name)).toEqual(["Incoming frame"]);
    expect(merged.canvas.currentPageId).toBe(incoming.canvas.currentPageId);
  });

  it("keeps other analyses that were created from the same source page", () => {
    const base = canvasFixture();
    base.canvas.pages[0].iberoAnalysisId = "analysis-b";
    base.canvas.pages[0].iberoSourcePageId = "original-page";
    const state = canvasFixture();
    state.canvas.pages[0].iberoSourcePageId = "original-page";
    const incoming = prepareIberoCanvas(state, {}, "analysis-a");
    const merged = replaceIberoPages(base, incoming);
    expect(merged.canvas.pages.map((page) => page.iberoAnalysisId)).toEqual(["analysis-b", "analysis-a"]);
  });

  it("keeps a stable source page identity after UUID regeneration", () => {
    const state = canvasFixture();
    const originalId = "aaaaaaaa-0000-4000-8000-000000000001";
    state.canvas.pages[0].id = originalId;
    state.canvas.currentPageId = originalId;
    const incoming = prepareIberoCanvas(state, {}, "analysis-a");
    expect(incoming.canvas.pages[0].id).not.toBe(originalId);
    expect(incoming.canvas.pages[0].iberoSourcePageId).toBe(originalId);
    expect(incoming.canvas.pages[0].iberoAnalysisId).toBe("analysis-a");
  });

  it("uses returned table names in source nodes and SQL configurations", () => {
    const state = canvasFixture();
    state.dag.nodes.query = { ...state.dag.nodes.source, type: "sql", config: { query: 'SELECT * FROM "data"', autoRun: true } };
    const incoming = prepareIberoCanvas(state, { data: "data_2" }, "analysis-a");
    expect(incoming.dag.nodes.source.config).toMatchObject({ tableName: "data_2" });
    expect(incoming.dag.nodes.query.config).toMatchObject({ query: 'SELECT * FROM "data_2"' });
    expect(incoming.dag.nodes.result.result).toBeNull();
  });
});
