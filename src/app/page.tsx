"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSessionLifecycle } from "@/hooks/useSessionLifecycle";
import { IberoHandoffError, receiveIberoHandoff } from "@/lib/iberoHandoff";
import { fetchSharedView } from "@/db/shares";
import type { PersistedAppState } from "@/lib/persistence";
import LoginPage from "@/components/auth/LoginPage";
import { v4 as uuidv4 } from "uuid";
import { buildPersistedAppState } from "@/lib/persistence";
import type { FromConfig, GroupConfig, SQLConfig, TableDisplayConfig, ColumnFilter, AggregationConfig, JoinConfig } from "@/types/nodes";
import type { DAGNode, DAGEdge } from "@/engine/types";
import { useIberoStore, iberoWorkspace } from "@/stores/iberoStore";

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
  sessionStorage.setItem("vistrace-handoff", JSON.stringify(state));
  console.log("[handoff] pipeline written to sessionStorage:", Object.keys(nodes).length, "nodes");
}

const CanvasApp = dynamic(() => import("@/components/canvas/CanvasApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm text-gray-500">Cargando vistrace...</p>
      </div>
    </div>
  ),
});

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
  const sessionChecked = useSessionLifecycle();
  const context = useIberoStore((s) => s.context);
  const [status, setStatus] = useState<"idle" | "auth" | "import" | "done">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("handoff") ? "auth" : "idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const handoffProcessedRef = useRef(false);

  const [shareStatus, setShareStatus] = useState<"none" | "loading" | "error">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("share") ? "loading" : "none");
  const [guestSnapshot, setGuestSnapshot] = useState<PersistedAppState | null>(null);
  const shareProcessedRef = useRef(false);

  useEffect(() => {
    const shareToken = new URLSearchParams(window.location.search).get("share");
    if (!shareToken) return;
    if (shareProcessedRef.current) return;
    shareProcessedRef.current = true;

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
    receiveIberoHandoff(params, buildAnalysisPipeline, () => setStatus("import"))
      .then(() => {
        window.history.replaceState({}, "", window.location.pathname);
        setStatus("done");
      })
      .catch((error) => {
        useAuthStore.getState().clearToken();
        window.history.replaceState({}, "", window.location.pathname);
        console.error("[handoff] Failed to open Ibero analysis:", error);
        setHandoffError(error instanceof IberoHandoffError ? error.message : "No se pudo abrir el análisis desde Ibero Data. Vuelve a intentarlo desde la página del dataset.");
        setStatus("idle");
      });
  }, []);

  if (!sessionChecked) return <Spinner label="Comprobando sesión..." />;

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
          <p role="alert" className="text-sm text-red-600">{handoffError}</p>
          <button
            onClick={() => setHandoffError(null)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  if (!token) return <LoginPage />;
  return <CanvasApp key={`${token}:${iberoWorkspace(context) ?? "default"}`} />;
}
