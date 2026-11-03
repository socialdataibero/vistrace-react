import { describe, expect, it, vi } from "vitest";
import {
  buildPersistedAppState,
  buildSafeVistraceTitle,
  buildVistraceFile,
  mergePersistedStates,
  parsePersistedAppState,
  parseVistraceFile,
  readPersistedUploadedTables,
  writePersistedUploadedTables,
} from "@/lib/persistence";
import type { PersistedAppState, VistraceExportedTable } from "@/lib/persistence";
import type { DAGNode } from "@/engine/types";

function createPersistedState(): PersistedAppState {
  return {
    version: 1,
    savedAt: "2025-01-01T00:00:00.000Z",
    nodePositions: {
      node1: { x: 10, y: 20 },
    },
    nodeSizes: {
      node1: { width: 320, height: 220 },
    },
    frames: [
      {
        id: "frame-1",
        pageId: "page-1",
        name: "Frame",
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        nodeIds: ["node1"],
      },
    ],
    canvas: {
      id: "canvas-1",
      title: "vistrace",
      pages: [{ id: "page-1", name: "Page 1", order: 0 }],
      currentPageId: "page-1",
      focusMode: false,
    },
    dag: {
      nodes: {},
      edges: [],
    },
  };
}

describe("parsePersistedAppState", () => {
  it("normalizes legacy state without nodeIds on frames", () => {
    const legacy = JSON.stringify({
      nodePositions: { node1: { x: 10, y: 20 } },
      canvas: {
        id: "canvas-1",
        title: "Legacy",
        pages: [{ id: "page-1", name: "Page 1", order: 0 }],
        currentPageId: "page-1",
        focusMode: false,
      },
      dag: {
        nodes: {},
        edges: [],
      },
      frames: [
        {
          id: "frame-1",
          pageId: "page-1",
          name: "Frame",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    });

    expect(parsePersistedAppState(legacy)).toMatchObject({
      version: 1,
      frames: [
        {
          id: "frame-1",
          nodeIds: [],
        },
      ],
    });
  });

  it("raises persisted source nodes to the new minimum height", () => {
    const state = createPersistedState();
    state.nodeSizes = {
      source: { width: 320, height: 220 },
      group: { width: 320, height: 220 },
      sql: { width: 320, height: 220 },
    };
    state.dag.nodes = {
      source: {
        id: "source",
        type: "from",
        config: {},
        inputIds: [],
        result: null,
        status: "idle",
        pageId: "page-1",
      },
      group: {
        id: "group",
        type: "group",
        config: {},
        inputIds: [],
        result: null,
        status: "idle",
        pageId: "page-1",
      },
      sql: {
        id: "sql",
        type: "sql",
        config: {},
        inputIds: [],
        result: null,
        status: "idle",
        pageId: "page-1",
      },
    };

    expect(parsePersistedAppState(JSON.stringify(state))).toMatchObject({
      nodeSizes: {
        source: { width: 320, height: 405 },
        group: { width: 320, height: 769 },
        sql: { width: 320, height: 485 },
      },
    });
  });

  it("resets legacy auto-sized table nodes back to the natural default height", () => {
    const state = createPersistedState();
    state.nodeSizes = {
      source: { width: 320, height: 405 },
      group: { width: 320, height: 769 },
      table: { width: 320, height: 400 },
    };
    state.dag.nodes = {
      source: {
        id: "source",
        type: "from",
        config: {},
        inputIds: [],
        result: null,
        status: "idle",
        pageId: "page-1",
      },
      group: {
        id: "group",
        type: "group",
        config: {},
        inputIds: [],
        result: null,
        status: "idle",
        pageId: "page-1",
      },
      table: {
        id: "table",
        type: "table",
        config: {},
        inputIds: [],
        result: null,
        status: "idle",
        pageId: "page-1",
      },
    };

    expect(parsePersistedAppState(JSON.stringify(state))).toMatchObject({
      nodeSizes: {
        source: { width: 320, height: 405 },
        group: { width: 320, height: 769 },
        table: { width: 320, height: 315 },
      },
    });
  });
});

describe("buildPersistedAppState", () => {
  it("stamps the current time and normalizes frames", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-03T04:05:06.000Z"));

    const state = buildPersistedAppState({
      nodePositions: {},
      canvas: {
        id: "canvas-1",
        title: "New",
        pages: [{ id: "page-1", name: "Page 1", order: 0 }],
        currentPageId: "page-1",
        focusMode: false,
      },
      dag: {
        nodes: {},
        edges: [],
      },
      frames: [
        {
          id: "frame-1",
          pageId: "page-1",
          name: "Frame",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          nodeIds: ["node1"],
        },
      ],
    });

    expect(state.savedAt).toBe("2025-02-03T04:05:06.000Z");
    expect(state.version).toBe(1);
    expect(state.frames?.[0]?.nodeIds).toEqual(["node1"]);

    vi.useRealTimers();
  });
});

describe("vistrace file helpers", () => {
  it("sanitizes exported titles into safe filenames", () => {
    expect(buildSafeVistraceTitle("  Sales Dashboard 2025 / LATAM  ")).toBe(
      "sales-dashboard-2025-latam"
    );
  });

  it("round-trips the modern file format", () => {
    const appState = createPersistedState();
    const tables: VistraceExportedTable[] = [
      {
        name: "orders",
        columns: [{ name: "amount", type: "INTEGER", nullable: false }],
        rowCount: 1,
        rows: [{ amount: 10 }],
      },
    ];

    const parsed = parseVistraceFile(JSON.stringify(buildVistraceFile(appState, tables)));

    expect(parsed).toMatchObject({
      format: "vistrace",
      appState: {
        canvas: { title: "vistrace" },
      },
      data: {
        tables: [{ name: "orders", rowCount: 1 }],
      },
    });
  });
});

function makeMergeState(
  pageId: string,
  nodes: Array<{ id: string; type: DAGNode["type"]; config: unknown }>,
  currentPageId = pageId
): PersistedAppState {
  return buildPersistedAppState({
    nodePositions: Object.fromEntries(nodes.map((n, i) => [n.id, { x: i * 100, y: 0 }])),
    nodeSizes: {},
    frames: [],
    canvas: {
      id: `canvas-${pageId}`,
      title: "Test",
      pages: [{ id: pageId, name: "Page", order: 0 }],
      currentPageId,
      focusMode: false,
    },
    dag: {
      nodes: Object.fromEntries(
        nodes.map((n) => [
          n.id,
          {
            id: n.id,
            type: n.type,
            config: n.config,
            inputIds: [],
            result: null,
            status: "idle",
            pageId,
          } as DAGNode,
        ])
      ),
      edges: [],
    },
  });
}

describe("mergePersistedStates", () => {
  it("appends new pages and focuses the incoming page", () => {
    const base = makeMergeState("p1", [
      { id: "a", type: "from", config: { tableName: "ventas" } },
    ]);
    const incoming = makeMergeState("p2", [
      { id: "b", type: "from", config: { tableName: "gastos" } },
    ]);

    const merged = mergePersistedStates(base, incoming);

    expect(merged.canvas.pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(merged.canvas.currentPageId).toBe("p2");
    expect(Object.keys(merged.dag.nodes).sort()).toEqual(["a", "b"]);
  });

  it("skips incoming pages whose pipeline already exists (same types + configs)", () => {
    const base = makeMergeState("p1", [
      { id: "a", type: "from", config: { tableName: "ventas" } },
      { id: "a2", type: "table", config: {} },
    ]);
    // Same pipeline, different uuids/page
    const incoming = makeMergeState("p9", [
      { id: "z", type: "from", config: { tableName: "ventas" } },
      { id: "z2", type: "table", config: {} },
    ]);

    const merged = mergePersistedStates(base, incoming);

    expect(merged.canvas.pages.map((p) => p.id)).toEqual(["p1"]);
    // Focuses the existing equivalent page instead of duplicating
    expect(merged.canvas.currentPageId).toBe("p1");
    expect(Object.keys(merged.dag.nodes).sort()).toEqual(["a", "a2"]);
    expect(Object.keys(merged.nodePositions).sort()).toEqual(["a", "a2"]);
  });

  it("merging the same incoming state twice is idempotent", () => {
    const base = makeMergeState("p1", [
      { id: "a", type: "from", config: { tableName: "ventas" } },
    ]);
    const incoming = makeMergeState("p2", [
      { id: "b", type: "group", config: { groupByColumns: ["region"] } },
    ]);

    const once = mergePersistedStates(base, incoming);
    const twice = mergePersistedStates(once, incoming);

    expect(twice.canvas.pages.length).toBe(once.canvas.pages.length);
    expect(Object.keys(twice.dag.nodes).length).toBe(Object.keys(once.dag.nodes).length);
  });

  it("keeps base currentPageId when everything incoming is a duplicate", () => {
    const base = makeMergeState("p1", [
      { id: "a", type: "sql", config: { query: "SELECT 1" } },
    ]);
    const incoming = makeMergeState("p2", [
      { id: "b", type: "sql", config: { query: "SELECT 1" } },
    ]);

    const merged = mergePersistedStates(base, incoming);
    expect(merged.canvas.currentPageId).toBe("p1");
    expect(merged.dag.edges).toEqual([]);
  });
});

describe("uploaded tables persistence", () => {
  it("filters invalid rows when reading uploaded tables", () => {
    writePersistedUploadedTables([
      {
        name: "valid_table",
        columns: [{ name: "id", type: "INTEGER", nullable: false }],
        rowCount: 1,
        rows: [{ id: 1 }],
      },
    ]);

    localStorage.setItem(
      "vistrace-uploaded-tables",
      JSON.stringify([
        ...readPersistedUploadedTables(),
        { invalid: true },
      ])
    );

    expect(readPersistedUploadedTables()).toEqual([
      {
        name: "valid_table",
        columns: [{ name: "id", type: "INTEGER", nullable: false }],
        rowCount: 1,
        rows: [{ id: 1 }],
      },
    ]);
  });
});
