import type { PersistedAppState } from "@/lib/persistence";
import { remapSqlTables } from "@/lib/sqlTables";
import { withFreshIds } from "@/lib/iberoPublish";
import type { FromConfig, SQLConfig } from "@/types/nodes";

export function prepareIberoCanvas(
  state: PersistedAppState,
  tableNames: Record<string, string>,
  analysisId?: string,
): PersistedAppState {
  const pages = state.canvas.pages.map((page) => ({
    ...page,
    iberoAnalysisId: analysisId,
    iberoSourcePageId: page.iberoSourcePageId ?? page.id,
  }));
  const nodes = Object.fromEntries(Object.entries(state.dag.nodes).map(([id, node]) => {
    let config = node.config;
    if (node.type === "from") {
      const from = config as FromConfig;
      const key = Object.keys(tableNames).find((name) => name.toLowerCase() === from.tableName.toLowerCase());
      config = { ...from, tableName: key ? tableNames[key] : from.tableName };
    }
    if (node.type === "sql") {
      const sql = config as SQLConfig;
      config = { ...sql, query: remapSqlTables(sql.query, tableNames) };
    }
    return [id, { ...node, config, result: null, status: "idle" as const }];
  }));
  const fresh = withFreshIds({ ...state, dag: { ...state.dag, nodes } });
  fresh.canvas.pages = fresh.canvas.pages.map((page, index) => ({ ...page, iberoAnalysisId: analysisId, iberoSourcePageId: pages[index].iberoSourcePageId }));
  return fresh;
}

export function replaceIberoPages(base: PersistedAppState, incoming: PersistedAppState): PersistedAppState {
  const replaced = new Set(base.canvas.pages.filter((page) => incoming.canvas.pages.some((next) => {
    if (page.iberoAnalysisId && next.iberoAnalysisId) return page.iberoAnalysisId === next.iberoAnalysisId;
    return page.id === next.id || page.id === next.iberoSourcePageId ||
      !!(page.iberoSourcePageId && page.iberoSourcePageId === next.iberoSourcePageId);
  })).map((page) => page.id));
  const nodes = Object.fromEntries(Object.entries(base.dag.nodes).filter(([, node]) => !replaced.has(node.pageId)));
  const retainedIds = new Set(Object.keys(nodes));
  const pick = <T,>(record: Record<string, T> | undefined) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => retainedIds.has(id)));
  const pages = [...base.canvas.pages.filter((page) => !replaced.has(page.id)), ...incoming.canvas.pages]
    .map((page, order) => ({ ...page, order }));
  return {
    ...base,
    savedAt: incoming.savedAt,
    canvas: { ...base.canvas, pages, currentPageId: incoming.canvas.currentPageId, focusMode: false },
    nodePositions: { ...pick(base.nodePositions), ...incoming.nodePositions },
    nodeSizes: { ...pick(base.nodeSizes), ...incoming.nodeSizes },
    frames: [...(base.frames ?? []).filter((frame) => !replaced.has(frame.pageId)), ...(incoming.frames ?? [])],
    dag: {
      nodes: { ...nodes, ...incoming.dag.nodes },
      edges: [...base.dag.edges.filter((edge) => retainedIds.has(edge.fromNodeId) && retainedIds.has(edge.toNodeId)), ...incoming.dag.edges],
    },
  };
}
