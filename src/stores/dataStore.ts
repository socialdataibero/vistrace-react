import { createStore, useStore } from "@/lib/createStore";
import { DataTable, ColumnStats } from "@/types/data";
import { SuggestedMapFlow } from "@/lib/columnSemantics";
import { dropTable, clearAllTables, exportTableData, importTableData } from "@/db/duckdb";
import { loadDataFile } from "@/db/fileLoader";
import { getColumnStats } from "@/db/queries";
import { getToken } from "@/stores/authStore";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface DataState {
  tables: DataTable[];
  initialized: boolean;
  loading: boolean;
  error: string | null;
  columnStats: Record<string, ColumnStats[]>;

  initialize: () => Promise<void>;
  uploadFile: (file: File) => Promise<DataTable>;
  deleteFile: (tableName: string) => Promise<void>;
  refreshTables: () => Promise<void>;
  refreshMapFlows: () => Promise<void>;
  loadColumnStats: (tableName: string) => Promise<void>;
}

const dataStore = createStore<DataState>((set, get) => ({
  tables: [],
  initialized: false,
  loading: false,
  error: null,
  columnStats: {},

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, error: null });
    try {
      await get().refreshTables();
      set({ initialized: true, loading: false });
      // Fetch map flows in background — non-blocking
      void get().refreshMapFlows();
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  deleteFile: async (tableName: string) => {
    const table = get().tables.find((t) => t.name === tableName);
    const endpoint = table?.filename
      ? `${API_BASE}/files/${encodeURIComponent(table.filename)}`
      : `${API_BASE}/tables/${encodeURIComponent(tableName)}`;
    const res = await fetch(endpoint, { method: "DELETE", headers: authHeaders() });
    if (!res.ok && res.status !== 404) throw new Error(`Error ${res.status}`);
    set((state) => ({ tables: state.tables.filter((t) => t.name !== tableName) }));
  },

  uploadFile: async (file: File) => {
    set({ loading: true, error: null });
    try {
      const table = await loadDataFile(file);
      set((state) => ({
        tables: [...state.tables.filter((t) => t.name !== table.name), table],
        loading: false,
      }));
      // Recompute map flows after a new table is added
      void get().refreshMapFlows();
      return table;
    } catch (err) {
      // `error` is the initialization error that replaces the whole canvas (SDI-113); callers show upload failures themselves.
      set({ loading: false });
      throw err;
    }
  },

  refreshTables: async () => {
    try {
      const res = await fetch(`${API_BASE}/tables`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const tables: DataTable[] = await res.json();
      set({ tables });
    } catch (err) {
      console.error("Error al refrescar tablas:", err);
    }
  },

  refreshMapFlows: async () => {
    try {
      const res = await fetch(`${API_BASE}/analysis/map-flows`, { headers: authHeaders() });
      if (!res.ok) return;
      const flows: SuggestedMapFlow[] = await res.json();

      set((state) => ({
        tables: state.tables.map((t) => ({
          ...t,
          suggestedMapFlows: flows.filter(
            (f) => f.geoTableName === t.name || f.dataTableName === t.name,
          ),
        })),
      }));
    } catch (err) {
      console.error("Error al refrescar map flows:", err);
    }
  },

  loadColumnStats: async (tableName: string) => {
    const table = get().tables.find((t) => t.name === tableName);
    if (!table) return;

    const stats = (
      await Promise.allSettled(
        table.columns.map((col) =>
          getColumnStats(tableName, col.name, col.type),
        ),
      )
    )
      .filter(
        (r): r is PromiseFulfilledResult<ColumnStats> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    set((state) => ({
      columnStats: { ...state.columnStats, [tableName]: stats },
    }));
  },
}));

export function useDataStore<S>(selector: (state: DataState) => S): S {
  return useStore(dataStore, selector);
}

// Direct access for outside React
export const dataStoreApi = dataStore;

// Re-export DuckDB table operations so callers don't need to import duckdb.ts directly
export { dropTable, clearAllTables, exportTableData, importTableData };
