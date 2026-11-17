import type { DAGNode } from "@/engine/types";
import type { PersistedAppState } from "@/lib/persistence";
import type { IberoContext } from "@/stores/iberoStore";

export function sessionToken(username: string, expires = Date.now() / 1000 + 3600): string {
  return `header.${btoa(JSON.stringify({ username, exp: expires }))}.signature`;
}

export function iberoContext(datasetId = "dataset-a"): IberoContext {
  return {
    apiUrl: "https://ibero.test/api",
    organizationId: "organization",
    organizationName: "Organization",
    datasetId,
    datasetTitle: datasetId,
    canPublish: true,
    publishToken: sessionToken("publisher"),
    resourceId: "resource-a",
    analysisId: "analysis-a",
    analysisTitle: "Existing analysis",
    analysisSlug: "custom-slug",
    analysisFolder: "custom-folder",
    analysisVisibility: "PUBLIC",
    analysisDescription: "Existing description",
  };
}

export function canvasFixture(): PersistedAppState {
  const source: DAGNode = {
    id: "source", type: "from", pageId: "page-a", config: { tableName: "data", filters: [] },
    inputIds: [], status: "idle", result: null,
  };
  const result: DAGNode = {
    id: "result", type: "table", pageId: "page-a", config: { hiddenColumns: [] },
    inputIds: ["source"], status: "success",
    result: { columns: [], rows: [], totalRows: 0, sql: 'SELECT * FROM "data"' },
  };
  return {
    version: 1, savedAt: "saved",
    canvas: {
      id: "canvas", title: "Canvas", currentPageId: "page-a", focusMode: false,
      pages: [{ id: "page-a", name: "Analysis", order: 0, iberoAnalysisId: "analysis-a" }],
    },
    nodePositions: { source: { x: 10, y: 20 }, result: { x: 30, y: 40 } },
    nodeSizes: { source: { width: 480, height: 500 } },
    frames: [{ id: "frame", pageId: "page-a", name: "Frame", nodeIds: ["source"], x: 0, y: 0, width: 600, height: 700 }],
    dag: { nodes: { source, result }, edges: [{ id: "edge", fromNodeId: "source", toNodeId: "result", toInputIndex: 0 }] },
  };
}
