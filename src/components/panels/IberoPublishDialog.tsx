"use client";

import { useEffect, useMemo, useState } from "react";
import { FiUploadCloud, FiX } from "react-icons/fi";
import type { DAGNode } from "@/engine/types";
import type { PersistedAppState } from "@/lib/persistence";
import type { CanvasPage } from "@/types/canvas";
import type { ChartConfig, FromConfig, NodeType } from "@/types/nodes";
import { buildIberoRecipe, publishCanvasToIbero, slugify } from "@/lib/iberoPublish";
import { canPublishToIbero, useIberoStore } from "@/stores/iberoStore";

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  from: "Tabla origen",
  sql: "SQL",
  group: "Agrupar",
  join: "Unir",
  chart: "Gráfica",
  table: "Tabla",
  distinct: "Valores únicos",
  javascript: "JavaScript",
  controls: "Controles",
};

function nodeLabel(node: DAGNode, pages: CanvasPage[]): string {
  const page = pages.find((p) => p.id === node.pageId)?.name;
  let detail = "";
  if (node.type === "from") detail = (node.config as FromConfig).tableName ?? "";
  if (node.type === "chart") detail = (node.config as ChartConfig).title ?? "";
  const base = detail ? `${NODE_TYPE_LABELS[node.type]} · ${detail}` : NODE_TYPE_LABELS[node.type];
  return page ? `${base} (${page})` : base;
}

interface IberoPublishDialogProps {
  nodes: Record<string, DAGNode>;
  pages: CanvasPage[];
  selectedNodeId: string | null;
  buildState: () => PersistedAppState;
  onClose: () => void;
}

export default function IberoPublishDialog({ nodes, pages, selectedNodeId, buildState, onClose }: IberoPublishDialogProps) {
  const context = useIberoStore((s) => s.context);
  const tableRefs = useIberoStore((s) => s.tables);
  const setAnalysis = useIberoStore((s) => s.setAnalysis);

  const candidates = useMemo(
    () => Object.values(nodes).filter((n) => n.status === "success" && !!n.result?.sql),
    [nodes]
  );

  const [resultNodeId, setResultNodeId] = useState(() => {
    if (selectedNodeId && candidates.some((n) => n.id === selectedNodeId)) return selectedNodeId;
    return (candidates.find((n) => n.type === "table") ?? candidates[0])?.id ?? "";
  });
  const [title, setTitle] = useState(context?.analysisTitle ?? "");
  const [slug, setSlug] = useState(context?.analysisTitle ? slugify(context.analysisTitle) : "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [folder, setFolder] = useState("VizCanvas");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [mode, setMode] = useState<"update" | "create">(context?.analysisId ? "update" : "create");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ title: string; rows?: number | null } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  const preview = useMemo(() => {
    if (!context || !resultNodeId) return null;
    try {
      return buildIberoRecipe(buildState(), resultNodeId, tableRefs, context.datasetId);
    } catch {
      return null;
    }
  }, [buildState, context, resultNodeId, tableRefs]);

  const canPublish = canPublishToIbero(context);
  const sourceResourceId = preview?.recipe.tables[0]?.resourceId ?? context?.resourceId ?? "";

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value));
  };

  const submit = async () => {
    if (!canPublishToIbero(context) || !preview) return;
    const node = nodes[resultNodeId];
    if (!node?.result?.sql) {
      setError("Ejecuta el nodo antes de guardarlo.");
      return;
    }
    if (!sourceResourceId) {
      setError("El canvas no usa ninguna tabla de este dataset de Ibero Data.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const analysis = await publishCanvasToIbero({
        context,
        sql: node.result.sql,
        sourceResourceId,
        title: title.trim(),
        slug,
        folder: folder.trim(),
        description: description.trim(),
        visibility,
        recipe: preview.recipe,
        update: mode === "update",
      });
      setAnalysis(analysis.id, analysis.title);
      setSaved({ title: analysis.title, rows: analysis.resultRowCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el análisis.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
  const labelClass = "mb-1 block text-xs font-semibold text-slate-600";
  const formValid = !!resultNodeId && title.trim().length >= 2 && /^[a-z0-9-]+$/.test(slug) && folder.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => !saving && onClose()} />
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Guardar análisis en Ibero Data</p>
            {context && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {context.organizationName} / {context.datasetTitle}
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <FiX size={16} />
          </button>
        </div>

        {saved ? (
          <div className="px-5 py-6">
            <p className="text-sm text-slate-700">
              Se guardó <span className="font-semibold">{saved.title}</span> en Ibero Data
              {saved.rows != null ? ` (${saved.rows.toLocaleString("es-MX")} filas)` : ""}. Ya aparece en los análisis del dataset.
            </p>
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                Listo
              </button>
            </div>
          </div>
        ) : !canPublish ? (
          <div className="px-5 py-6 text-sm text-slate-600">
            {context
              ? "Tu permiso para guardar en Ibero Data expiró. Vuelve a abrir VizCanvas desde el recurso en Ibero Data."
              : "Este canvas no está conectado a Ibero Data. Ábrelo desde un recurso con \"Crear análisis con VizCanvas\"."}
          </div>
        ) : (
          <form
            className="flex flex-col gap-3 overflow-y-auto px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {context?.analysisId && (
              <div>
                <span className={labelClass}>Acción</span>
                <div className="flex gap-4 text-sm text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={mode === "update"} onChange={() => setMode("update")} />
                    Actualizar “{context.analysisTitle}”
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} />
                    Crear uno nuevo
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="ibero-result-node">Nodo con el resultado</label>
              {candidates.length === 0 ? (
                <p className="text-xs text-amber-700">Ejecuta al menos un nodo del canvas para poder guardarlo.</p>
              ) : (
                <select id="ibero-result-node" className={inputClass} value={resultNodeId} onChange={(e) => setResultNodeId(e.target.value)}>
                  {candidates.map((n) => (
                    <option key={n.id} value={n.id}>{nodeLabel(n, pages)}</option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                Se guardan todos los datos de este nodo y la receta completa de su página.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="ibero-title">Título</label>
              <input id="ibero-title" className={inputClass} value={title} onChange={(e) => onTitleChange(e.target.value)} required minLength={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="ibero-slug">Slug</label>
                <input
                  id="ibero-slug"
                  className={inputClass}
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugEdited(true);
                  }}
                  pattern="[a-z0-9-]+"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="ibero-folder">Carpeta</label>
                <input id="ibero-folder" className={inputClass} value={folder} onChange={(e) => setFolder(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="ibero-description">Descripción</label>
              <textarea id="ibero-description" className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ibero-visibility">Visibilidad</label>
              <select
                id="ibero-visibility"
                className={inputClass}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "PRIVATE" | "PUBLIC")}
              >
                <option value="PRIVATE">Privado</option>
                <option value="PUBLIC">Público</option>
              </select>
            </div>

            {preview && preview.missingTables.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Estas tablas no vienen de este dataset: <strong>{preview.missingTables.join(", ")}</strong>. El resultado se
                guarda completo, pero quien reabra el análisis en otra instancia de VizCanvas no podrá recalcular los nodos
                que las usan.
              </p>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}

            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !formValid}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiUploadCloud size={15} />
                {saving ? "Guardando…" : mode === "update" && context?.analysisId ? "Actualizar análisis" : "Guardar análisis"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
