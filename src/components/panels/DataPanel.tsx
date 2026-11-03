"use client";

import React, { useRef, useState } from "react";
import { LuChartColumnBig, LuFolderOpen } from "react-icons/lu";
import { useDataStore } from "@/stores/dataStore";
import { isSupported } from "@/db/fileLoader";
import { formatBytes } from "@/lib/utils";
import Dialog from "@/components/ui/Dialog";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
import {
  JoinSuggestion,
  SuggestedMapFlow,
  getColumnRoleLabel,
  hasGeometryColumn,
} from "@/lib/columnSemantics";

interface Props {
  onAddFromNode: (tableName: string) => void;
  onCreateMapFlow: (tableName: string, suggestion?: SuggestedMapFlow) => void;
}

function ColTypeIcon({ type }: { type: string }) {
  if (/int|float|double|decimal|numeric|real|bigint/i.test(type))
    return <span className="col-type-badge col-type-num">#</span>;
  if (/date|timestamp|time/i.test(type))
    return <span className="col-type-badge col-type-date" style={{ fontSize: 7 }}>T</span>;
  if (/bool/i.test(type))
    return <span className="col-type-badge col-type-bool">?</span>;
  return <span className="col-type-badge col-type-str">T</span>;
}

function ColRoleBadge({ role }: { role: "geometry" | "latitude" | "longitude" | "join_key" | undefined }) {
  const label = getColumnRoleLabel(role);
  if (!label) return null;

  const palette =
    role === "geometry"
      ? "bg-emerald-100 text-emerald-700"
      : role === "join_key"
        ? "bg-amber-100 text-amber-700"
        : "bg-sky-100 text-sky-700";

  return (
    <span className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${palette}`}>
      {label}
    </span>
  );
}

function getJoinStrength(suggestion: JoinSuggestion): {
  label: string;
  className: string;
} {
  if (suggestion.sampleCoverage >= 0.9 || suggestion.sharedValueCount >= 12 || suggestion.score >= 70) {
    return {
      label: "Strong",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (suggestion.sampleCoverage >= 0.45 || suggestion.sharedValueCount >= 4 || suggestion.score >= 35) {
    return {
      label: "Good",
      className: "bg-sky-100 text-sky-700",
    };
  }

  return {
    label: "Possible",
    className: "bg-amber-100 text-amber-700",
  };
}

export default function DataPanel({ onAddFromNode, onCreateMapFlow }: Props) {
  const tables = useDataStore((s) => s.tables);
  const uploadFile = useDataStore((s) => s.uploadFile);
  const deleteFile = useDataStore((s) => s.deleteFile);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ title: string; message: string; type?: "info" | "error" | "warning" | "confirm"; onConfirm?: () => void } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    const inputFiles = Array.from(files);
    const tooBig = inputFiles.filter((f) => f.size > MAX_FILE_SIZE);
    const unsupported = inputFiles.filter((f) => !isSupported(f.name) && !tooBig.includes(f));
    const supported = inputFiles.filter((f) => isSupported(f.name) && f.size <= MAX_FILE_SIZE);

    if (tooBig.length > 0) {
      setDialog({
        type: "error",
        title: "Archivo demasiado grande",
        message: `${tooBig.map((f) => f.name).join(", ")} supera el límite de 500 MB.`,
      });
    }
    if (unsupported.length > 0) {
      setDialog({
        type: "warning",
        title: "Formato no soportado",
        message: `${unsupported.map((f) => f.name).join(", ")} no es un formato válido. Usa CSV, JSON, TSV, Parquet, GeoJSON o TopoJSON.`,
      });
    }
    if (supported.length === 0) return;

    setUploading(true);
    try {
      const results = await Promise.allSettled(supported.map((f) => uploadFile(f)));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed.length > 0) {
        const reasons = [...new Set(failed.map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))))];
        setDialog({
          type: "error",
          title: "Error al cargar",
          message: `No se pudieron cargar ${failed.length} archivo(s). ${reasons.join(" ")}`,
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filteredTables = tables.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="panel w-64 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col"
      onDrop={async (e) => { e.preventDefault(); e.stopPropagation(); await processFiles(e.dataTransfer.files); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
        <span className="text-xs font-semibold text-gray-700">Data</span>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
        >
          {uploading ? <span className="animate-spin text-xs inline-block">↻</span> : <span>+</span>}
          Upload
        </button>
        <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.tsv,.json,.jsonl,.parquet,.geojson,.topojson" multiple onChange={handleFileChange} />
      </div>

      {/* Search */}
      {tables.length > 0 && (
        <div className="px-2 py-1.5 border-b border-gray-50">
          <input
            type="text"
            placeholder="Search tables…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-gray-100 bg-gray-50 px-2 py-1 text-xs outline-none focus:border-teal-300 focus:bg-white"
          />
        </div>
      )}

      {/* Tables */}
      <div className="flex-1 overflow-y-auto py-1">
        {tables.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center px-4">
            <LuFolderOpen className="h-8 w-8 text-gray-300" />
            <p className="text-xs text-gray-500">Drop CSV, JSON, GeoJSON, TopoJSON, or Parquet files here</p>
            <button
              onClick={async () => {
                setUploading(true);
                try {
                  const res = await fetch("/sample_data.csv");
                  if (!res.ok) throw new Error(`No se pudo descargar el archivo de ejemplo (${res.status}).`);
                  const blob = await res.blob();
                  await uploadFile(new File([blob], "sample_data.csv", { type: "text/csv" }));
                } catch (err) {
                  setDialog({
                    type: "error",
                    title: "No se pudieron cargar los datos de ejemplo",
                    message: err instanceof Error ? err.message : String(err),
                  });
                }
                setUploading(false);
              }}
              disabled={uploading}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "#14b8a6" }}
            >
              <span className="inline-flex items-center gap-1.5">
                <LuChartColumnBig className="h-3.5 w-3.5" />
                <span>{uploading ? "Loading…" : "Load Sample Data"}</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="px-2 space-y-0.5">
            {/* Source badge */}
            <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: "#14b8a6" }}>DuckDB</span>
              <span className="text-[10px] text-gray-400">{tables.length} table{tables.length !== 1 ? "s" : ""}</span>
            </div>

            {filteredTables.map((table) => (
              <div key={table.name} className="rounded-lg border border-gray-100 overflow-hidden">
                <div
                  className="group flex items-center gap-1.5 px-2 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedTable(expandedTable === table.name ? null : table.name)}
                >
                  {(() => {
                    const isGeospatialTable = hasGeometryColumn(table.columns);
                    const topMapSuggestion = table.suggestedMapFlows?.[0] ?? null;
                    const canCreateMap = isGeospatialTable && Boolean(topMapSuggestion);

                    return (
                      <>
                  <span className="text-gray-400 text-[9px] flex-shrink-0">
                    {expandedTable === table.name ? "▾" : "▸"}
                  </span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">⊞</span>
                  <span className="text-xs font-medium text-gray-800 truncate flex-1">{table.name}</span>
                  {isGeospatialTable && (
                    <span className="flex-shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">
                      Geo
                    </span>
                  )}
                  <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {table.columns.length}c
                  </span>
                  {canCreateMap && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCreateMapFlow(table.name, topMapSuggestion ?? undefined); }}
                      title="Create a map with the best suggested join"
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white transition-opacity"
                      style={{ background: "#0f766e" }}
                    >
                      Map
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddFromNode(table.name); }}
                    title="Open as source node"
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white transition-opacity"
                    style={{ background: "#14b8a6" }}
                  >
                    +
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(table.name);
                      setDialog({
                        type: "confirm",
                        title: "Eliminar tabla",
                        message: `¿Eliminar "${table.name}"? Esta acción no se puede deshacer.`,
                        onConfirm: async () => {
                          setDeleting(table.name);
                          try { await deleteFile(table.name); } finally { setDeleting(null); setPendingDelete(null); }
                        },
                      });
                    }}
                    title="Delete table"
                    disabled={deleting === table.name}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: "#ef4444" }}
                  >
                    {deleting === table.name ? "…" : "✕"}
                  </button>
                      </>
                    );
                  })()}
                </div>

                {expandedTable === table.name && (
                  <div className="border-t border-gray-50 bg-gray-50/50">
                    {(() => {
                      const isGeospatialTable = hasGeometryColumn(table.columns);
                      const topMapSuggestion = table.suggestedMapFlows?.[0] ?? null;
                      const candidateTableCount = tables.filter(
                        (candidate) => candidate.name !== table.name && !hasGeometryColumn(candidate.columns)
                      ).length;

                      if (!isGeospatialTable) return null;

                      return (
                        <div className="border-b border-gray-100 bg-emerald-50/70 px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                Suggested Map Join
                              </div>
                              {topMapSuggestion ? (
                                <p className="mt-1 text-[10px] leading-4 text-emerald-700">
                                  Checked {candidateTableCount} tabular table{candidateTableCount === 1 ? "" : "s"} and kept
                                  the best match by key names and shared sample values.
                                </p>
                              ) : (
                                <p className="mt-1 text-[10px] leading-4 text-emerald-700">
                                  No matching tabular table found yet. Load a table with a shared key such as state code or
                                  state name to enable one-click map creation.
                                </p>
                              )}
                            </div>
                          </div>
                          {topMapSuggestion && (
                            <div className="mt-2 space-y-2">
                              {(() => {
                                const strength = getJoinStrength(topMapSuggestion.join);

                                return (
                                  <div className="rounded-md border border-emerald-300 bg-white px-2.5 py-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                                            Best Match
                                          </span>
                                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${strength.className}`}>
                                            {strength.label}
                                          </span>
                                          <span className="truncate text-[11px] font-semibold text-emerald-950">
                                            {topMapSuggestion.dataTableName}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-[10px] leading-4 text-emerald-800">
                                          Join <span className="font-mono">{topMapSuggestion.join.leftColumn}</span> ={" "}
                                          <span className="font-mono">{topMapSuggestion.join.rightColumn}</span>
                                        </p>
                                        <p className="mt-1 text-[10px] leading-4 text-emerald-700">
                                          {topMapSuggestion.join.reason}
                                        </p>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onCreateMapFlow(table.name, topMapSuggestion);
                                        }}
                                        className="flex-shrink-0 rounded px-2 py-1 text-[10px] font-medium text-white"
                                        style={{ background: "#0f766e" }}
                                      >
                                        Create
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {table.columns.map((col) => (
                      <div key={col.name} className="flex items-center gap-1.5 px-3 py-1 hover:bg-gray-100">
                        <ColTypeIcon type={col.type} />
                        <ColRoleBadge role={col.role} />
                        <span className="text-[11px] text-gray-700 truncate flex-1">{col.name}</span>
                        <span className="text-[9px] text-gray-400 font-mono truncate max-w-[55px]">
                          {col.type.split("(")[0].toLowerCase()}
                        </span>
                      </div>
                    ))}
                    {table.fileSize && (
                      <div className="px-3 py-1.5 border-t border-gray-100 text-[9px] text-gray-400 flex gap-1">
                        <span>{formatBytes(table.fileSize)}</span>
                        <span>·</span>
                        <span className="uppercase">{table.fileType}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {filteredTables.length === 0 && search && (
              <div className="py-4 text-center text-xs text-gray-400">No tables match &quot;{search}&quot;</div>
            )}
          </div>
        )}
      </div>
      {dialog && (
        <Dialog
          open={true}
          title={dialog.title}
          message={dialog.message}
          type={dialog.type}
          confirmLabel={dialog.type === "confirm" ? "Eliminar" : "Aceptar"}
          onConfirm={dialog.onConfirm}
          onClose={() => { setDialog(null); setPendingDelete(null); }}
        />
      )}
    </div>
  );
}
