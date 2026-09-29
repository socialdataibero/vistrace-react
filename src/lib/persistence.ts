import { DAGNode, DAGEdge } from "@/engine/types";
import { CanvasFrame, CanvasPage, VersionSnapshot } from "@/types/canvas";
import { ColumnInfo } from "@/types/nodes";
import { getBaseCanvasNodeHeight, getCanvasNodeWidth } from "@/lib/canvasLayout";

export const STORAGE_KEY = "vizcanvas-state";
export const SNAPSHOTS_STORAGE_KEY = "vizcanvas-snapshots";
export const UPLOADED_TABLES_STORAGE_KEY = "vizcanvas-uploaded-tables";
const STORAGE_VERSION = 1;
export const VIZCANVAS_FILE_EXTENSION = ".vzc";
const VIZCANVAS_FORMAT = "vizcanvas";
const VIZCANVAS_VERSION = 1;
const TABULAR_PREVIEW_NODE_TYPES = new Set(["from", "sql", "group", "join", "table", "distinct", "controls"]);

export interface PersistedAppState {
  version: number;
  savedAt: string;
  nodePositions: Record<string, { x: number; y: number }>;
  nodeSizes?: Record<string, { width: number; height: number }>;
  frames?: CanvasFrame[];
  canvas: {
    id: string;
    title: string;
    pages: CanvasPage[];
    currentPageId: string;
    focusMode: boolean;
  };
  dag: {
    nodes: Record<string, DAGNode>;
    edges: DAGEdge[];
  };
}

export interface VizCanvasExportedTable {
  name: string;
  columns: ColumnInfo[];
  rowCount: number;
  rows: Record<string, unknown>[];
  fileSize?: number;
  fileType?: string;
}

export interface VizCanvasFile {
  format: typeof VIZCANVAS_FORMAT;
  version: number;
  exportedAt: string;
  appState: PersistedAppState;
  data: {
    tables: VizCanvasExportedTable[];
  };
}

function normalizeFrames(frames: CanvasFrame[] | undefined): CanvasFrame[] {
  return (frames ?? []).map((frame) => ({
    ...frame,
    nodeIds: Array.isArray(frame.nodeIds) ? frame.nodeIds : [],
  }));
}

function normalizeNodeSizes(state: PersistedAppState): PersistedAppState["nodeSizes"] {
  const nodeSizes = state.nodeSizes ?? {};

  return Object.fromEntries(
    Object.entries(nodeSizes).map(([nodeId, size]) => {
      const node = state.dag.nodes[nodeId];
      if (!node) {
        return [nodeId, size];
      }

      const minHeight = getBaseCanvasNodeHeight(node.type);
      const defaultWidth = getCanvasNodeWidth(node.type);
      const shouldResetLegacyAutoHeight =
        TABULAR_PREVIEW_NODE_TYPES.has(node.type) &&
        size.width === defaultWidth &&
        size.height > minHeight;

      return [
        nodeId,
        {
          ...size,
          height: shouldResetLegacyAutoHeight
            ? minHeight
            : Math.max(size.height, minHeight),
        },
      ];
    })
  );
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

export function dedupePersistedAppState(state: PersistedAppState): PersistedAppState {
  const edgeKeys = new Set<string>();
  const edges = uniqueById(state.dag.edges).filter((e) => {
    const key = `${e.fromNodeId}->${e.toNodeId}:${e.toInputIndex}`;
    return edgeKeys.has(key) ? false : (edgeKeys.add(key), true);
  });
  const nodes = Object.fromEntries(
    Object.entries(state.dag.nodes).map(([id, node]) => [
      id,
      Array.isArray(node.inputIds) ? { ...node, inputIds: [...new Set(node.inputIds)] } : node,
    ])
  );
  return {
    ...state,
    frames: uniqueById(state.frames ?? []),
    canvas: { ...state.canvas, pages: uniqueById(state.canvas.pages) },
    dag: { nodes, edges },
  };
}

function normalizePersistedAppState(parsed: unknown): PersistedAppState | null {
  const state = normalizePersistedAppStateShape(parsed);
  return state ? dedupePersistedAppState(state) : null;
}

function normalizePersistedAppStateShape(parsed: unknown): PersistedAppState | null {
  if (!parsed || typeof parsed !== "object") return null;

  const version = typeof (parsed as { version?: unknown }).version === "number"
    ? (parsed as { version: number }).version
    : 0;

  if (version === 0 || version === undefined) {
    if ((parsed as Partial<PersistedAppState>).canvas && (parsed as Partial<PersistedAppState>).dag && (parsed as Partial<PersistedAppState>).nodePositions) {
      const state = parsed as PersistedAppState;
      return {
        ...state,
        version: STORAGE_VERSION,
        nodeSizes: normalizeNodeSizes(state),
        frames: normalizeFrames(state.frames),
      };
    }
    return null;
  }

  if (version === STORAGE_VERSION) {
    const state = parsed as PersistedAppState;
    return {
      ...state,
      nodeSizes: normalizeNodeSizes(state),
      frames: normalizeFrames(state.frames),
    };
  }

  console.warn(`[Persistence] Unknown version ${version}, attempting to load`);
  const state = parsed as PersistedAppState;
  return {
    ...state,
    nodeSizes: normalizeNodeSizes(state),
    frames: normalizeFrames(state.frames),
  };
}

export function readPersistedAppState(): PersistedAppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parsePersistedAppState(raw);
  } catch {
    return null;
  }
}

export function writePersistedAppState(state: PersistedAppState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[Persistence] Failed to save app state:", err);
  }
}

export function parsePersistedAppState(raw: string): PersistedAppState | null {
  try {
    const parsed = JSON.parse(raw);
    return normalizePersistedAppState(parsed);
  } catch {
    return null;
  }
}

export function readPersistedSnapshots(): VersionSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((snapshot): snapshot is VersionSnapshot => (
      Boolean(snapshot) &&
      typeof snapshot === "object" &&
      typeof snapshot.id === "string" &&
      typeof snapshot.timestamp === "string" &&
      typeof snapshot.data === "string"
    ));
  } catch {
    return [];
  }
}

export function writePersistedSnapshots(snapshots: VersionSnapshot[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
  } catch (err) {
    console.warn("[Persistence] Failed to save snapshots:", err);
  }
}

export function readPersistedUploadedTables(): VizCanvasExportedTable[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(UPLOADED_TABLES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((table): table is VizCanvasExportedTable => (
      Boolean(table) &&
      typeof table === "object" &&
      typeof table.name === "string" &&
      Array.isArray(table.columns) &&
      Array.isArray(table.rows) &&
      typeof table.rowCount === "number"
    ));
  } catch {
    return [];
  }
}

export function writePersistedUploadedTables(tables: VizCanvasExportedTable[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UPLOADED_TABLES_STORAGE_KEY, JSON.stringify(tables));
  } catch (err) {
    console.warn("[Persistence] Failed to save uploaded tables:", err);
  }
}

export function buildPersistedAppState(input: Omit<PersistedAppState, "version" | "savedAt">): PersistedAppState {
  return {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    ...input,
    frames: normalizeFrames(input.frames),
  };
}

export function clonePersistedAppState(state: PersistedAppState): PersistedAppState {
  return JSON.parse(JSON.stringify(state)) as PersistedAppState;
}
function pageSignature(state: PersistedAppState, pageId: string): string {
  return Object.values(state.dag.nodes)
    .filter((node) => node.pageId === pageId)
    .map((node) => `${node.type}:${JSON.stringify(node.config ?? {})}`)
    .sort()
    .join("|");
}
export function mergePersistedStates(
  base: PersistedAppState,
  incoming: PersistedAppState
): PersistedAppState {
  const baseSignatures = new Map<string, string>(
    base.canvas.pages.map((page) => [pageSignature(base, page.id), page.id])
  );

  const basePageIds = new Set(base.canvas.pages.map((page) => page.id));
  const keptPages: CanvasPage[] = [];
  let focusPageId: string | null = null;

  for (const page of incoming.canvas.pages) {
    const sig = pageSignature(incoming, page.id);
    const existingPageId = basePageIds.has(page.id) ? page.id : sig ? baseSignatures.get(sig) : undefined;
    if (existingPageId) {
      if (page.id === incoming.canvas.currentPageId || focusPageId === null) {
        focusPageId = existingPageId;
      }
    } else {
      keptPages.push(page);
      if (page.id === incoming.canvas.currentPageId) {
        focusPageId = page.id;
      }
    }
  }

  const keptPageIds = new Set(keptPages.map((p) => p.id));
  const keptNodes = Object.fromEntries(
    Object.entries(incoming.dag.nodes).filter(([, node]) => keptPageIds.has(node.pageId))
  );
  const keptNodeIds = new Set(Object.keys(keptNodes));
  const keptEdges = incoming.dag.edges.filter(
    (e) => keptNodeIds.has(e.fromNodeId) && keptNodeIds.has(e.toNodeId)
  );
  const keptPositions = Object.fromEntries(
    Object.entries(incoming.nodePositions).filter(([id]) => keptNodeIds.has(id))
  );
  const keptSizes = Object.fromEntries(
    Object.entries(incoming.nodeSizes ?? {}).filter(([id]) => keptNodeIds.has(id))
  );
  const keptFrames = normalizeFrames(incoming.frames).filter((f) => keptPageIds.has(f.pageId));

  const baseOrderMax = base.canvas.pages.reduce((max, p) => Math.max(max, p.order), -1);
  const incomingPages = keptPages.map((page, i) => ({
    ...page,
    order: baseOrderMax + 1 + i,
  }));

  return dedupePersistedAppState({
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    nodePositions: { ...base.nodePositions, ...keptPositions },
    nodeSizes: { ...(base.nodeSizes ?? {}), ...keptSizes },
    frames: [...normalizeFrames(base.frames), ...keptFrames],
    canvas: {
      ...base.canvas,
      pages: [...base.canvas.pages, ...incomingPages],
      currentPageId: focusPageId ?? base.canvas.currentPageId,
      focusMode: false,
    },
    dag: {
      nodes: { ...base.dag.nodes, ...keptNodes },
      edges: [...base.dag.edges, ...keptEdges],
    },
  });
}

export function buildSafeVizCanvasTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-canvas";
}

export function buildVizCanvasFile(
  appState: PersistedAppState,
  tables: VizCanvasExportedTable[]
): VizCanvasFile {
  return {
    format: VIZCANVAS_FORMAT,
    version: VIZCANVAS_VERSION,
    exportedAt: new Date().toISOString(),
    appState,
    data: {
      tables,
    },
  };
}

export function parseVizCanvasFile(raw: string): VizCanvasFile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VizCanvasFile & PersistedAppState>;

    if (parsed?.format === VIZCANVAS_FORMAT && parsed.appState) {
      const tables = Array.isArray(parsed.data?.tables) ? parsed.data.tables : [];
      return {
        format: VIZCANVAS_FORMAT,
        version: typeof parsed.version === "number" ? parsed.version : VIZCANVAS_VERSION,
        exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
        appState: {
          ...parsed.appState,
          frames: normalizeFrames(parsed.appState.frames),
        },
        data: {
          tables,
        },
      };
    }

    if (parsed && typeof parsed.version === "number" && parsed.canvas && parsed.dag) {
        return {
          format: VIZCANVAS_FORMAT,
          version: VIZCANVAS_VERSION,
          exportedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
        appState: {
          ...(parsed as PersistedAppState),
          frames: normalizeFrames((parsed as PersistedAppState).frames),
        },
          data: {
            tables: [],
          },
      };
    }

    return null;
  } catch {
    return null;
  }
}
