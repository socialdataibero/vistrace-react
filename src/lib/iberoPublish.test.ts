import { describe, expect, it } from "vitest";
import type { PersistedAppState } from "@/lib/persistence";
import type { DAGNode } from "@/engine/types";
import { buildIberoRecipe, extractPageState, resourceIdFromDownloadUrl, slugify, withFreshIds } from "./iberoPublish";
import { dedupePersistedAppState, mergePersistedStates } from "./persistence";

const RES_A = "11111111-1111-4111-8111-111111111111";
const RES_B = "22222222-2222-4222-8222-222222222222";

function node(id: string, pageId: string, type: DAGNode["type"], config: Record<string, unknown> = {}): DAGNode {
  return { id, pageId, type, config: config as DAGNode["config"], inputIds: [], result: null, status: "idle" };
}

function makeState(): PersistedAppState {
  return {
    version: 1,
    savedAt: "2026-09-29T00:00:00.000Z",
    nodePositions: { f1: { x: 0, y: 0 }, t1: { x: 1, y: 1 }, f2: { x: 2, y: 2 } },
    nodeSizes: { f1: { width: 10, height: 10 } },
    frames: [
      { id: "fr1", pageId: "p1", name: "A", x: 0, y: 0, width: 1, height: 1, nodeIds: ["f1"] },
      { id: "fr2", pageId: "p2", name: "B", x: 0, y: 0, width: 1, height: 1, nodeIds: ["f2"] },
    ],
    canvas: {
      id: "c",
      title: "Canvas",
      pages: [
        { id: "p1", name: "Análisis", order: 3 },
        { id: "p2", name: "Otra", order: 4 },
      ],
      currentPageId: "p2",
      focusMode: true,
    },
    dag: {
      nodes: {
        f1: node("f1", "p1", "from", { tableName: "hogares" }),
        j1: node("j1", "p1", "from", { tableName: "subido_a_mano" }),
        t1: node("t1", "p1", "table"),
        f2: node("f2", "p2", "from", { tableName: "personas" }),
      },
      edges: [
        { id: "e1", fromNodeId: "f1", toNodeId: "t1", toInputIndex: 0 },
        { id: "e2", fromNodeId: "f2", toNodeId: "t1", toInputIndex: 1 },
      ],
    },
  };
}

describe("resourceIdFromDownloadUrl", () => {
  it("extrae el resource de las URLs privadas y públicas", () => {
    expect(resourceIdFromDownloadUrl(`http://x/organizations/o/datasets/d/resources/${RES_A}/download`)).toBe(RES_A);
    expect(resourceIdFromDownloadUrl(`http://x/public/catalog/slug/resources/${RES_A}/download`)).toBe(RES_A);
  });

  it("ignora descargas que no son de un resource", () => {
    expect(resourceIdFromDownloadUrl(`http://x/organizations/o/datasets/d/analyses/${RES_A}/download`)).toBeNull();
  });
});

describe("slugify", () => {
  it("quita acentos y caracteres no válidos", () => {
    expect(slugify("  Ingreso por Región — 2020! ")).toBe("ingreso-por-region-2020");
  });
});

describe("extractPageState", () => {
  it("deja solo nodos, aristas, posiciones y marcos de la página", () => {
    const page = extractPageState(makeState(), "p1");
    expect(Object.keys(page.dag.nodes).sort()).toEqual(["f1", "j1", "t1"]);
    expect(page.dag.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(Object.keys(page.nodePositions).sort()).toEqual(["f1", "t1"]);
    expect(page.frames?.map((f) => f.id)).toEqual(["fr1"]);
    expect(page.canvas.pages).toEqual([{ id: "p1", name: "Análisis", order: 0 }]);
    expect(page.canvas.currentPageId).toBe("p1");
    expect(page.canvas.focusMode).toBe(false);
  });
});

describe("buildIberoRecipe", () => {
  it("mapea las tablas del dataset y reporta las que no lo son", () => {
    const { recipe, missingTables } = buildIberoRecipe(
      makeState(),
      "t1",
      {
        hogares: { resourceId: RES_A, datasetId: "d1" },
        personas: { resourceId: RES_B, datasetId: "d1" },
        subido_a_mano: { resourceId: RES_B, datasetId: "otro" },
      },
      "d1"
    );
    expect(recipe.resultNodeId).toBe("t1");
    expect(recipe.tables).toEqual([{ tableName: "hogares", resourceId: RES_A }]);
    expect(missingTables).toEqual(["subido_a_mano"]);
    expect(Object.keys(recipe.state.dag.nodes)).not.toContain("f2");
  });

  it("falla si el nodo resultado ya no existe", () => {
    expect(() => buildIberoRecipe(makeState(), "nope", {}, "d1")).toThrow();
  });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("withFreshIds", () => {
  it("cambia ids de páginas, nodos y aristas, y las referencias en el SQL", () => {
    const P = "aaaaaaaa-0000-4000-8000-000000000001";
    const F = "aaaaaaaa-0000-4000-8000-000000000002";
    const Q = "aaaaaaaa-0000-4000-8000-000000000003";
    const E = "aaaaaaaa-0000-4000-8000-000000000004";
    const state: PersistedAppState = {
      version: 1,
      savedAt: "x",
      nodePositions: { [F]: { x: 0, y: 0 } },
      frames: [],
      canvas: { id: "c", title: "t", pages: [{ id: P, name: "A", order: 0 }], currentPageId: P, focusMode: false },
      dag: {
        nodes: {
          [F]: node(F, P, "from", { tableName: "t" }),
          [Q]: { ...node(Q, P, "sql", { query: `SELECT * FROM ${F}` }), inputIds: [F] },
        },
        edges: [{ id: E, fromNodeId: F, toNodeId: Q, toInputIndex: 0 }],
      },
    };

    const fresh = withFreshIds(state);
    const [newF, newQ] = [Object.keys(fresh.dag.nodes)[0], Object.keys(fresh.dag.nodes)[1]];
    expect(newF).toMatch(UUID);
    expect([newF, newQ]).not.toContain(F);
    expect(fresh.canvas.pages[0].id).not.toBe(P);
    expect(fresh.canvas.currentPageId).toBe(fresh.canvas.pages[0].id);
    expect(fresh.dag.nodes[newF].pageId).toBe(fresh.canvas.pages[0].id);
    expect(fresh.dag.edges[0]).toMatchObject({ fromNodeId: newF, toNodeId: newQ });
    expect(fresh.dag.nodes[newQ].inputIds).toEqual([newF]);
    expect((fresh.dag.nodes[newQ].config as { query: string }).query).toBe(`SELECT * FROM ${newF}`);
    expect(Object.keys(fresh.nodePositions)).toEqual([newF]);
  });
});

describe("dedupePersistedAppState", () => {
  it("quita páginas y aristas repetidas", () => {
    const state = makeState();
    state.canvas.pages.push({ ...state.canvas.pages[0] });
    state.dag.edges.push({ ...state.dag.edges[0] });
    state.dag.edges.push({ ...state.dag.edges[0], id: "otra" });
    const clean = dedupePersistedAppState(state);
    expect(clean.canvas.pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(clean.dag.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("mergePersistedStates", () => {
  it("no duplica una página que ya existe con el mismo id aunque su contenido cambió", () => {
    const base = makeState();
    const incoming = extractPageState(makeState(), "p1");
    incoming.dag.nodes.t1 = { ...incoming.dag.nodes.t1, config: { hiddenColumns: ["x"] } as DAGNode["config"] };
    const merged = mergePersistedStates(base, incoming);
    expect(merged.canvas.pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(merged.dag.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(merged.canvas.currentPageId).toBe("p1");
  });
});
