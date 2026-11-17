import { apiFetch } from "@/lib/session";
/**
 * DuckDB client — all operations are delegated to the NestJS server.
 * The function signatures are intentionally kept identical to the old
 * DuckDB-WASM version so the rest of the codebase (DAG engine, stores,
 * hooks) needs zero changes.
 */
import { ColumnInfo, QueryResult } from "@/types/nodes";

import { getToken } from "@/stores/authStore";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra };
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `Error ${res.status}: ${path}`,
    );
  }
  return res.json() as Promise<T>;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `Error ${res.status}: ${path}`,
    );
  }
  return res.json() as Promise<T>;
}

async function apiDelete(path: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Error ${res.status}: DELETE ${path}`);
  }
}

// ─── Public API (same signatures as DuckDB-WASM version) ─────────────────────

/** No-op: the server manages the DuckDB lifecycle. */
export async function initDuckDB(): Promise<void> {}

export async function executeQuery(sql: string): Promise<QueryResult> {
  const result = await apiPost<QueryResult>("/query/execute", { sql });
  return { ...result, columns: result.columns };
}

export async function executeQueryLimited(
  sql: string,
  limit = 250,
): Promise<QueryResult> {
  const result = await apiPost<QueryResult>("/query/execute-limited", {
    sql,
    limit,
  });
  return { ...result, columns: result.columns };
}

export async function getTables(): Promise<string[]> {
  const tables = await apiGet<Array<{ name: string }>>("/tables");
  return tables.map((t) => t.name);
}

export async function getTableSchema(tableName: string): Promise<ColumnInfo[]> {
  const cols = await apiGet<ColumnInfo[]>(
    `/tables/${encodeURIComponent(tableName)}/schema`,
  );
  return cols;
}

export async function dropTable(tableName: string): Promise<void> {
  await apiDelete(`/tables/${encodeURIComponent(tableName)}`);
}

export async function clearAllTables(): Promise<void> {
  await apiDelete("/tables");
}

export async function exportTableData(tableName: string): Promise<{
  columns: ColumnInfo[];
  rowCount: number;
  rows: Record<string, unknown>[];
  dataEmbedded: boolean;
}> {
  return apiGet(`/tables/${encodeURIComponent(tableName)}/export`);
}

export async function importTableData(
  tableName: string,
  rows: Record<string, unknown>[],
  columns: ColumnInfo[],
): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
  return apiPost("/tables/import", { tableName, rows, columns });
}

/**
 * loadFile is no longer used directly — file uploads go through
 * dataStore.uploadFile → fileLoader.loadDataFile → POST /api/files/upload.
 * Kept for type compatibility; throws if called directly.
 */
export async function loadFile(
  _file: File,
  _tableName: string,
): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
  throw new Error(
    "loadFile() está deprecated. Usa dataStore.uploadFile() en su lugar.",
  );
}
