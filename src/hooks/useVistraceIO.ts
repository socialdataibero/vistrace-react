import { useCallback } from "react";
import { dataStoreApi } from "@/stores/dataStore";
import { dagStoreApi } from "@/stores/dagStore";
import {
  buildSafeVistraceTitle,
  buildVistraceFile,
  parseVistraceFile,
  PersistedAppState,
  VISTRACE_FILE_EXTENSION,
} from "@/lib/persistence";
import { clearAllTables, exportTableData, importTableData } from "@/db/duckdb";

interface UseVistraceIOParams {
  title: string;
  buildCurrentPersistedState: () => PersistedAppState;
  applyPersistedState: (state: PersistedAppState) => void;
}

export function useVistraceIO({
  title,
  buildCurrentPersistedState,
  applyPersistedState,
}: UseVistraceIOParams) {
  const exportVistrace = useCallback(async () => {
    const currentTables = dataStoreApi.getState().tables;
    const exportedTables = await Promise.all(
      currentTables.map(async (table) => {
        const exported = await exportTableData(table.name);
        return {
          name: table.name,
          columns: exported.columns,
          rowCount: exported.rowCount,
          rows: exported.rows,
          dataEmbedded: exported.dataEmbedded,
          fileSize: table.fileSize,
          fileType: table.fileType,
        };
      })
    );

    const file = buildVistraceFile(buildCurrentPersistedState(), exportedTables);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${buildSafeVistraceTitle(title)}${VISTRACE_FILE_EXTENSION}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [buildCurrentPersistedState, title]);

  const importVistrace = useCallback(async (file: File) => {
    const parsed = parseVistraceFile(await file.text());
    if (!parsed) {
      throw new Error("El archivo no es valido o no tiene un formato compatible.");
    }

    await clearAllTables();

    for (const table of parsed.data.tables) {
      // Skip import if rows were not embedded (large table — data lives on server)
      if ((table as { dataEmbedded?: boolean }).dataEmbedded === false) continue;
      await importTableData(table.name, table.rows, table.columns);
    }

    dataStoreApi.setState({
      tables: parsed.data.tables.map((table) => ({
        name: table.name,
        columns: table.columns,
        rowCount: table.rowCount,
        fileSize: table.fileSize,
        fileType: table.fileType,
      })),
      loading: false,
      error: null,
      columnStats: {},
    });

    applyPersistedState(parsed.appState);
    await dagStoreApi.getState().executeAll();
  }, [applyPersistedState]);

  return {
    exportVistrace,
    importVistrace,
  };
}
