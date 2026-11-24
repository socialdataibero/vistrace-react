"use client";

import React, { useEffect, useMemo } from "react";
import { LuFilter } from "react-icons/lu";
import { DAGNode } from "@/engine/types";
import { ControlsConfig, ControlDefinition } from "@/types/nodes";
import { useDagStore } from "@/stores/dagStore";
import { v4 as uuidv4 } from "uuid";
import { INITIAL_TABLE_VISIBLE_ROWS } from "@/lib/canvasLayout";
import TablePreview from "./shared/TablePreview";
import NodeInfoTooltip from "./shared/NodeInfoTooltip";

interface Props {
  node: DAGNode;
  expandTablePreview?: boolean;
}

const EMPTY_COLUMNS: { name: string; type: string }[] = [];
const EMPTY_CONTROLS: ControlDefinition[] = [];

function getFilterTypeLabel(type: ControlDefinition["type"]): string {
  switch (type) {
    case "dropdown":
      return "Exact match";
    case "text":
      return "Contains text";
    case "slider":
      return "Value range";
    case "date":
      return "Date range";
  }
}

function isControlComplete(control: ControlDefinition): boolean {
  if (!control.column) return false;

  switch (control.type) {
    case "dropdown":
    case "text":
      return String(control.value ?? "").trim().length > 0;
    case "slider":
      if (Array.isArray(control.value)) {
        return control.value.length === 2 && control.value.every((value) => value !== undefined && value !== null && value !== "");
      }
      return control.value !== undefined && control.value !== null && control.value !== "";
    case "date":
      if (Array.isArray(control.value)) {
        return control.value.length === 2 && control.value.every((value) => String(value ?? "").trim().length > 0);
      }
      return String(control.value ?? "").trim().length > 0;
  }
}

export default function ControlsNodeBody({ node, expandTablePreview = false }: Props) {
  const config = node.config as ControlsConfig;
  const updateNodeConfig = useDagStore((s) => s.updateNodeConfig);
  const executeDirty = useDagStore((s) => s.executeDirty);
  const upstreamIds = useDagStore((s) => s.getUpstreamNodeIds(node.id));
  const upstreamNode = useDagStore((s) => upstreamIds[0] ? s.nodes[upstreamIds[0]] : undefined);
  const availableColumns = upstreamNode?.result?.columns ?? EMPTY_COLUMNS;
  const previewResult = node.result ?? upstreamNode?.result ?? null;
  const controls = config.controls ?? EMPTY_CONTROLS;
  const validFilterCount = useMemo(
    () => controls.filter((control) => isControlComplete(control)).length,
    [controls]
  );
  const completedControlsSignature = useMemo(
    () =>
      JSON.stringify(
        controls
          .filter((control) => isControlComplete(control))
          .map((control) => ({
            id: control.id,
            type: control.type,
            column: control.column,
            value: control.value,
          }))
      ),
    [controls]
  );
  const hasPendingFilters = validFilterCount > 0 && node.status !== "success";

  useEffect(() => {
    if (validFilterCount === 0) return;
    void executeDirty(node.id);
  }, [completedControlsSignature, executeDirty, node.id, validFilterCount]);

  const updateControlsConfig = (nextControls: ControlDefinition[]) => {
    updateNodeConfig(node.id, { controls: nextControls } as Partial<ControlsConfig>, { autoExecute: false });
  };

  const handleAddControl = (type: ControlDefinition["type"]) => {
    const nextControls = [...controls];
    nextControls.push({
      id: uuidv4(),
      type,
      column: availableColumns[0]?.name || "",
      value: undefined,
    });
    updateControlsConfig(nextControls);
  };

  const handleUpdateControl = (index: number, patch: Partial<ControlDefinition>) => {
    const nextControls = [...controls];
    nextControls[index] = { ...nextControls[index], ...patch };
    updateControlsConfig(nextControls);
  };

  const handleRemoveControl = (index: number) => {
    const nextControls = controls.filter((_, i) => i !== index);
    updateControlsConfig(nextControls);
  };

  if (availableColumns.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-xs text-gray-400">
        <LuFilter className="h-7 w-7" />
        Connect an input first
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col gap-3 no-drag ${expandTablePreview ? "h-full" : ""}`}>
      <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-semibold text-sky-900">Interactive filters</div>
          <NodeInfoTooltip
            title="Interactive filters"
            description="Add controls people can change without touching SQL. Each completed control filters the incoming rows automatically."
          />
        </div>
      </div>

      {/* Controls list */}
      {controls.map((ctrl, i) => (
        <div key={ctrl.id} className="rounded-lg border border-gray-100 p-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase">{getFilterTypeLabel(ctrl.type)}</span>
            <button onClick={() => handleRemoveControl(i)} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
          <select
            value={ctrl.column}
            onChange={(e) => handleUpdateControl(i, { column: e.target.value })}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
          >
            {availableColumns.map((col) => (
              <option key={col.name} value={col.name}>{col.name}</option>
            ))}
          </select>
          {ctrl.type === "text" && (
            <input
              type="text"
              placeholder="Contains..."
              value={String(ctrl.value || "")}
              onChange={(e) => handleUpdateControl(i, { value: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
            />
          )}
          {ctrl.type === "dropdown" && (
            <select
              value={String(ctrl.value || "")}
              onChange={(e) => handleUpdateControl(i, { value: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
            >
              <option value="">Select...</option>
              {(() => {
                const colData = upstreamNode?.result?.rows || [];
                const uniqueVals = [...new Set(colData.map((r) => String(r[ctrl.column] ?? "")))].filter(Boolean).slice(0, 100);
                return uniqueVals.map((v) => <option key={v} value={v}>{v}</option>);
              })()}
            </select>
          )}
          {ctrl.type === "slider" && (
            <input
              type="range"
              min={ctrl.min || 0}
              max={ctrl.max || 100}
              value={Number(ctrl.value ?? 50)}
              onChange={(e) => handleUpdateControl(i, { value: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          )}
        </div>
      ))}

      {/* Add control buttons */}
      <div className="flex flex-shrink-0 gap-1">
        {(["dropdown", "text", "slider"] as ControlDefinition["type"][]).map((type) => (
          <button
            key={type}
            onClick={() => handleAddControl(type)}
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50"
          >
            + {getFilterTypeLabel(type)}
          </button>
        ))}
      </div>

      <div className="flex-shrink-0 text-[10px] text-gray-400">
        {validFilterCount === 0
          ? "Showing input rows. Complete a filter to apply it."
          : hasPendingFilters
            ? "Applying filters..."
            : "Filters applied."}
      </div>

      {previewResult && (
        <TablePreview
          result={previewResult}
          maxRows={expandTablePreview ? 20 : INITIAL_TABLE_VISIBLE_ROWS}
          fillAvailableHeight={expandTablePreview}
        />
      )}
    </div>
  );
}
