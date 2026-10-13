"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useAuthStore, isTokenUsable, type AuthUser } from "@/stores/authStore";
import { fetchSharedView } from "@/db/shares";
import type { PersistedAppState } from "@/lib/persistence";
import LoginPage from "@/components/auth/LoginPage";
import { v4 as uuidv4 } from "uuid";
import { buildPersistedAppState } from "@/lib/persistence";
import type { FromConfig, GroupConfig, SQLConfig, TableDisplayConfig, ColumnFilter, AggregationConfig, JoinConfig } from "@/types/nodes";
import type { DAGNode, DAGEdge } from "@/engine/types";
import { parseIberoContext, useIberoStore, type IberoContext } from "@/stores/iberoStore";
import { resourceIdFromDownloadUrl, withFreshIds } from "@/lib/iberoPublish";

function registerIberoTable(context: IberoContext | null, tableName: string | null | undefined, downloadUrl: string) {
  const resourceId = resourceIdFromDownloadUrl(downloadUrl);
  if (!context || !tableName || !resourceId) return;
  useIberoStore.getState().registerTable(tableName, { resourceId, datasetId: context.datasetId });
}

function buildAnalysisPipeline(
  recipe: Record<string, unknown>,
  sourceTableName: string,
  _resultTableName: string,
  joinTableNamesByAlias: Record<string, string> = {}
) {
  const pageId = uuidv4();
  const nodes: Record<string, DAGNode> = {};
  const edges: DAGEdge[] = [];
  const nodePositions: Record<string, { x: number; y: number }> = {};

  let x = 80;
  const y = 300;
  const gap = 480;
  let prevId: string | null = null;

  function addNode(node: DAGNode, pos: { x: number; y: number }) {
    nodes[node.id] = node;
    nodePositions[node.id] = pos;
  }

  function connect(fromId: string, toId: string, toInputIndex = 0) {
    const edgeId = uuidv4();
    edges.push({ id: edgeId, fromNodeId: fromId, toNodeId: toId, toInputIndex });
    nodes[toId] = { ...nodes[toId], inputIds: [...nodes[toId].inputIds, fromId] };
  }

  type RawFilter = { column: string; operator: string; value: unknown };
  const rawFilters = (recipe.filters as RawFilter[]) ?? [];
  const fromFilters: ColumnFilter[] = rawFilters.map((f) => ({
    column: f.column,
    operator: f.operator as ColumnFilter["operator"],
    value: f.value,
  }));

  const fromId = uuidv4();
  addNode({
    id: fromId, type: "from",
    config: { tableName: sourceTableName, filters: fromFilters } as FromConfig,
    inputIds: [], result: null, status: "idle", pageId,
  }, { x, y });
  prevId = fromId;
  x += gap;
  type RawJoin = { resourceId: string; alias: string; type: string; onLeft: string; onRight: string };
  const joins = (recipe.joins as RawJoin[]) ?? [];

  for (const j of joins) {
    const joinTableName = joinTableNamesByAlias[j.alias] ?? j.alias;

    const joinFromId = uuidv4();
    addNode({
      id: joinFromId, type: "from",
      config: { tableName: joinTableName, filters: [] } as FromConfig,
      inputIds: [], result: null, status: "idle", pageId,
    }, { x, y: y + 220 });

    const joinNodeId = uuidv4();
    addNode({
      id: joinNodeId, type: "join",
      config: {
        joinType: (j.type === "left" ? "LEFT" : "INNER") as JoinConfig["joinType"],
        leftColumn: j.onLeft,
        rightColumn: j.onRight,
      } as JoinConfig,
      inputIds: [], result: null, status: "idle", pageId,
    }, { x, y });

    connect(prevId!, joinNodeId, 0);
    connect(joinFromId, joinNodeId, 1);
    prevId = joinNodeId;
    x += gap;
  }

  type RawCompute = { left: string; right: string; as: string };
  const computes = (recipe.computes as RawCompute[]) ?? [];

  if (computes.length > 0) {
    const cols = computes.map((c) => `"${c.left}" * "${c.right}" AS "${c.as}"`).join(", ");
    const sqlId = uuidv4();
    addNode({
      id: sqlId, type: "sql",
      config: { query: `SELECT *, ${cols} FROM input`, autoRun: true } as SQLConfig,
      inputIds: [], result: null, status: "idle", pageId,
    }, { x, y });
    connect(prevId!, sqlId);
    prevId = sqlId;
    x += gap;
  }
  const groupByCols = (recipe.group_by as string[]) ?? [];
  type RawAgg = { func: string; column?: string; as?: string };
  const rawAggs = (recipe.aggregates as RawAgg[]) ?? [];
  const SUPPORTED_FUNCS = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);

  if (groupByCols.length > 0 || rawAggs.length > 0) {
    const aggregations: AggregationConfig[] = rawAggs
      .filter((a) => SUPPORTED_FUNCS.has((a.func ?? "").toUpperCase()))
      .map((a) => ({
        function: a.func.toUpperCase() as AggregationConfig["function"],
        column: (a.column === "*" || !a.column) ? (groupByCols[0] ?? undefined) : a.column,
        alias: a.as,
      }));

    const groupId = uuidv4();
    addNode({
      id: groupId, type: "group",
      config: {
        groupByColumns: groupByCols,
        aggregations,
        configVersion: 1,
        lastRunVersion: 1,
      } as GroupConfig,
      inputIds: [], result: null, status: "idle", pageId,
    }, { x, y });
    connect(prevId!, groupId);
    prevId = groupId;
    x += gap;
  }

  type RawSort = { column: string; dir: string };
  const sorts = (recipe.sort as RawSort[]) ?? [];
  const limit = recipe.limit as number | null | undefined;

  if (sorts.length > 0 || limit != null) {
    const orderPart = sorts.length > 0
      ? ` ORDER BY ${sorts.map((s) => `"${s.column}" ${s.dir.toUpperCase()}`).join(", ")}`
      : "";
    const limitPart = limit != null ? ` LIMIT ${limit}` : "";
    const sqlId = uuidv4();
    addNode({
      id: sqlId, type: "sql",
      config: { query: `SELECT * FROM input${orderPart}${limitPart}`, autoRun: true } as SQLConfig,
      inputIds: [], result: null, status: "idle", pageId,
    }, { x, y });
    connect(prevId!, sqlId);
    prevId = sqlId;
    x += gap;
  }

  const tableId = uuidv4();
  addNode({
    id: tableId, type: "table",
    config: { hiddenColumns: [] } as TableDisplayConfig,
    inputIds: [], result: null, status: "idle", pageId,
  }, { x, y });
  connect(prevId!, tableId);

  const state = buildPersistedAppState({
    nodePositions,
    canvas: {
      id: uuidv4(),
      title: `Análisis — ${sourceTableName}`,
      pages: [{ id: pageId, name: "Análisis", order: 0 }],
      currentPageId: pageId,
      focusMode: false,
    },
    dag: { nodes, edges },
  });
  sessionStorage.setItem("vizcanvas-handoff", JSON.stringify(state));
  console.log("[handoff] pipeline written to sessionStorage:", Object.keys(nodes).length, "nodes");
}

const CanvasApp = dynamic(() => import("@/components/canvas/CanvasApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm text-gray-500">Loading VizCanvas...</p>
      </div>
    </div>
  ),
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const [status, setStatus] = useState<"idle" | "auth" | "import" | "done">("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const handoffProcessedRef = useRef(false);

  const [shareStatus, setShareStatus] = useState<"none" | "loading" | "error">("none");
  const [guestSnapshot, setGuestSnapshot] = useState<PersistedAppState | null>(null);
  const shareProcessedRef = useRef(false);

  useEffect(() => {
    const shareToken = new URLSearchParams(window.location.search).get("share");
    if (!shareToken) return;
    if (shareProcessedRef.current) return;
    shareProcessedRef.current = true;

    setShareStatus("loading");
    fetchSharedView(shareToken)
      .then((snapshot) => {
        if (!snapshot) {
          setShareStatus("error");
          return;
        }
        setGuestSnapshot(snapshot);
        setShareStatus("none");
      })
      .catch(() => setShareStatus("error"));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get("handoff");

    if (!handoff) return;

    if (handoffProcessedRef.current) return;
    handoffProcessedRef.current = true;
    const existingToken = isTokenUsable(token) ? token : null;

    setStatus("auth");

    fetch(`${API_BASE}/users/ibero-sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoffToken: handoff }),
    })
      .then(async (res) => {
        const data = await res.json() as {
          token?: string;
          message?: string[];
          iberoDownloadToken?: string;
          user?: AuthUser;
          iberoContext?: unknown;
          canvas?: { state?: unknown; tables?: { tableName: string; resourceId: string; downloadUrl: string }[] } | null;
        };
        console.log("[handoff] ibero-sign-in status:", res.status, "body:", data, "sesión activa:", !!existingToken);
        if (!res.ok || !data.token) {
          if (!existingToken) {
            const msg = Array.isArray(data.message) ? data.message[0] : (data.message ?? `Error ${res.status}`);
            setHandoffError(String(msg));
            setStatus("idle");
            return;
          }
          console.warn("[handoff] no se pudo consumir el token de Ibero Data; se continúa con la sesión activa");
        }
        const sessionToken = existingToken ?? data.token!;
        const iberoContext = parseIberoContext(data.iberoContext);
        if (iberoContext) useIberoStore.getState().setContext(iberoContext);

        const resourceUrl = params.get("resource_url");
        const resourceName = params.get("resource_name");
        const resourceFormat = params.get("resource_format") ?? "csv";
        const sourceResourceUrl = params.get("source_resource_url");
        const sourceResourceName = params.get("source_resource_name");
        const pipelineB64 = params.get("pipeline");
        const joinResourcesB64 = params.get("join_resources");
        console.log("[handoff] resource_url:", resourceUrl, "source:", sourceResourceUrl, "pipeline:", !!pipelineB64);
        window.history.replaceState({}, "", window.location.pathname);

        setStatus("import");

        if (resourceUrl && resourceName) {
          try {
            const importRes = await fetch(`${API_BASE}/tables/import-from-url`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
              },
              body: JSON.stringify({
                url: resourceUrl,
                tableName: resourceName,
                format: resourceFormat,
                downloadToken: data.iberoDownloadToken ?? "",
              }),
            });
            if (!importRes.ok) {
              const errBody = await importRes.json().catch(() => ({})) as { message?: string };
              console.warn("[handoff] import result failed:", importRes.status, errBody);
            } else {
              const importData = await importRes.json() as { tableName?: string; rowCount?: number; skipped?: boolean };
              registerIberoTable(iberoContext, importData.tableName, resourceUrl);
              console.log(importData.skipped ? "[handoff] result al ready exists, not imported:" : "[handoff] import result ok:", importData);
            }
          } catch (e) {
            console.warn("[handoff] import result network error:", e);
          }
        }
        let importedSourceTableName: string | null = null;

        if (sourceResourceUrl && sourceResourceName) {
          try {
            const srcRes = await fetch(`${API_BASE}/tables/import-from-url`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
              },
              body: JSON.stringify({
                url: sourceResourceUrl,
                tableName: sourceResourceName,
                format: "parquet",
                downloadToken: data.iberoDownloadToken ?? "",
              }),
            });
            if (srcRes.ok) {
              const srcData = await srcRes.json() as { tableName?: string; skipped?: boolean };
              importedSourceTableName = srcData.tableName ?? null;
              registerIberoTable(iberoContext, srcData.tableName, sourceResourceUrl);
              console.log(srcData.skipped ? "[handoff] source already exists, not reimported:" : "[handoff] import source ok:", srcData);
            }
          } catch (e) {
            console.warn("[handoff] import source network error:", e);
          }
        }
        const joinTableNamesByAlias: Record<string, string> = {};
        if (joinResourcesB64) {
          try {
            const standardB64 = joinResourcesB64.replace(/-/g, "+").replace(/_/g, "/");
            const joinResources = JSON.parse(atob(standardB64)) as { alias: string; url: string; name: string }[];
            for (const jr of joinResources) {
              try {
                const jRes = await fetch(`${API_BASE}/tables/import-from-url`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${sessionToken}`,
                  },
                  body: JSON.stringify({
                    url: jr.url,
                    tableName: jr.name,
                    format: "parquet",
                    downloadToken: data.iberoDownloadToken ?? "",
                  }),
                });
                if (jRes.ok) {
                  const jData = await jRes.json() as { tableName?: string; skipped?: boolean };
                  if (jData.tableName) joinTableNamesByAlias[jr.alias] = jData.tableName;
                  registerIberoTable(iberoContext, jData.tableName, jr.url);
                  console.log(jData.skipped ? "[handoff] join resource already exists:" : "[handoff] import join resource ok:", jr.alias, jData);
                }
              } catch (e) {
                console.warn("[handoff] import join resource network error:", jr.alias, e);
              }
            }
          } catch (e) {
            console.warn("[handoff] could not parse join_resources:", e);
          }
        }

        if (pipelineB64 && sourceResourceName) {
          try {
            const standardB64 = pipelineB64.replace(/-/g, "+").replace(/_/g, "/");
            const recipe = JSON.parse(atob(standardB64)) as Record<string, unknown>;
            console.log("[handoff] recipe keys:", Object.keys(recipe));
            buildAnalysisPipeline(recipe, importedSourceTableName ?? sourceResourceName, resourceName ?? "resultado", joinTableNamesByAlias);
          } catch (e) {
            console.warn("[handoff] could not build pipeline from recipe:", e);
          }
        }

        if (data.canvas?.state && typeof data.canvas.state === "object") {
          for (const table of data.canvas.tables ?? []) {
            try {
              const tRes = await fetch(`${API_BASE}/tables/import-from-url`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${sessionToken}`,
                },
                body: JSON.stringify({
                  url: table.downloadUrl,
                  tableName: table.tableName,
                  format: "parquet",
                  downloadToken: data.iberoDownloadToken ?? "",
                }),
              });
              if (tRes.ok) {
                const tData = await tRes.json() as { tableName?: string };
                if (iberoContext && tData.tableName) {
                  useIberoStore.getState().registerTable(tData.tableName, { resourceId: table.resourceId, datasetId: iberoContext.datasetId });
                }
              } else {
                console.warn("[handoff] import canvas table failed:", table.tableName, tRes.status);
              }
            } catch (e) {
              console.warn("[handoff] import canvas table network error:", table.tableName, e);
            }
          }
          sessionStorage.setItem("vizcanvas-handoff", JSON.stringify(withFreshIds(data.canvas.state as PersistedAppState)));
        }

        if (!existingToken && data.token) {
          setSession(data.token, data.user ?? null, "ibero");
        }
        setStatus("done");
      })
      .catch((e) => {
        console.error("[handoff] network error:", e);
        setHandoffError("cannot complete handoff due to network error");
        setStatus("idle");
      });
  }, [token, setSession]);

  if (shareStatus === "loading") return <Spinner label="Cargando visualización compartida..." />;
  if (shareStatus === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
          <div className="text-4xl">🔗</div>
          <p className="text-sm font-medium text-slate-700">Este enlace no es válido</p>
          <p className="text-xs text-slate-500">
            Puede que ya haya sido abierto por otro invitado o que haya expirado.
            Pídele a quien te lo compartió que genere uno nuevo.
          </p>
        </div>
      </div>
    );
  }
  if (guestSnapshot) return <CanvasApp guestSnapshot={guestSnapshot} />;

  if (status === "auth") return <Spinner label="Autenticando con Ibero Data..." />;
  if (status === "import") return <Spinner label="Importando datos desde Ibero Data..." />;

  if (handoffError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-red-600">{handoffError}</p>
          <button
            onClick={() => setHandoffError(null)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Ir al login
          </button>
        </div>
      </div>
    );
  }

  if (!token) return <LoginPage />;
  return <CanvasApp />;
}
