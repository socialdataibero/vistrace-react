import { v4 as uuidv4 } from "uuid";
import type { PersistedAppState } from "@/lib/persistence";
import type { FromConfig } from "@/types/nodes";
import { getToken } from "@/stores/authStore";
import type { IberoContext, IberoTableRef } from "@/stores/iberoStore";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";
const RECIPE_VERSION = 1;

export interface IberoCanvasRecipe {
  version: number;
  resultNodeId: string;
  state: PersistedAppState;
  tables: { tableName: string; resourceId: string }[];
}

export function resourceIdFromDownloadUrl(url: string): string | null {
  return url.match(/\/resources\/([0-9a-f-]{36})\/download(?:[?#]|$)/i)?.[1] ?? null;
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function extractPageState(state: PersistedAppState, pageId: string): PersistedAppState {
  const page = state.canvas.pages.find((p) => p.id === pageId);
  const nodes = Object.fromEntries(
    Object.entries(state.dag.nodes).filter(([, node]) => node.pageId === pageId)
  );
  const nodeIds = new Set(Object.keys(nodes));
  const pick = <T,>(record: Record<string, T> | undefined) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => nodeIds.has(id)));

  return {
    ...state,
    nodePositions: pick(state.nodePositions),
    nodeSizes: pick(state.nodeSizes),
    frames: (state.frames ?? []).filter((f) => f.pageId === pageId),
    canvas: {
      ...state.canvas,
      pages: page ? [{ ...page, order: 0 }] : [],
      currentPageId: pageId,
      focusMode: false,
    },
    dag: {
      nodes,
      edges: state.dag.edges.filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)),
    },
  };
}

export function withFreshIds(state: PersistedAppState): PersistedAppState {
  const ids = [
    ...state.canvas.pages.map((p) => p.id),
    ...Object.keys(state.dag.nodes),
    ...state.dag.edges.map((e) => e.id),
    ...(state.frames ?? []).map((f) => f.id),
  ];
  const mapping = new Map([...new Set(ids)].map((id) => [id, uuidv4()]));
  const json = JSON.stringify(state).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (id) => mapping.get(id) ?? id
  );
  return JSON.parse(json) as PersistedAppState;
}

export function collectSourceTables(state: PersistedAppState): string[] {
  const names = new Set<string>();
  for (const node of Object.values(state.dag.nodes)) {
    if (node.type !== "from") continue;
    const tableName = (node.config as FromConfig).tableName;
    if (tableName) names.add(tableName);
  }
  return [...names].sort();
}

export function buildIberoRecipe(
  fullState: PersistedAppState,
  resultNodeId: string,
  tableRefs: Record<string, IberoTableRef>,
  datasetId: string
): { recipe: IberoCanvasRecipe; missingTables: string[] } {
  const resultNode = fullState.dag.nodes[resultNodeId];
  if (!resultNode) throw new Error("El nodo resultado ya no existe en el canvas.");

  const state = extractPageState(fullState, resultNode.pageId);
  const tables: IberoCanvasRecipe["tables"] = [];
  const missingTables: string[] = [];
  for (const tableName of collectSourceTables(state)) {
    const ref = tableRefs[tableName];
    if (ref && ref.datasetId === datasetId) tables.push({ tableName, resourceId: ref.resourceId });
    else missingTables.push(tableName);
  }

  return {
    recipe: { version: RECIPE_VERSION, resultNodeId, state, tables },
    missingTables,
  };
}

export interface PublishToIberoInput {
  context: IberoContext & { publishToken: string };
  sql: string;
  sourceResourceId: string;
  title: string;
  slug: string;
  folder: string;
  description?: string;
  visibility: "PUBLIC" | "PRIVATE";
  recipe: IberoCanvasRecipe;
  update: boolean;
}

export interface PublishedIberoAnalysis {
  id: string;
  title: string;
  slug: string;
  status: string;
  resultRowCount?: number | null;
}

export async function publishCanvasToIbero(input: PublishToIberoInput): Promise<PublishedIberoAnalysis> {
  const token = getToken();
  const { context } = input;
  const res = await fetch(`${API_BASE}/ibero/analyses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      sql: input.sql,
      apiUrl: context.apiUrl,
      publishToken: context.publishToken,
      organizationId: context.organizationId,
      datasetId: context.datasetId,
      analysisId: input.update ? context.analysisId : undefined,
      sourceResourceId: input.sourceResourceId,
      title: input.title,
      slug: input.slug,
      folder: input.folder,
      description: input.description || undefined,
      visibility: input.visibility,
      recipe: input.recipe,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = body.message;
    const text = Array.isArray(message) ? message.join(". ") : typeof message === "string" ? message : `Error ${res.status}`;
    throw new Error(text);
  }
  return body as unknown as PublishedIberoAnalysis;
}
