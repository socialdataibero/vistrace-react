import { DataTable } from "@/types/data";
import { ColumnInfo } from "@/types/nodes";
import { getToken } from "@/stores/authStore";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

interface UploadResponse {
  originalName: string;
  filename: string;
  tableName: string;
  columns: ColumnInfo[];
  rowCount: number;
  size: number;
  mimetype: string;
  uploadedAt: string;
}

export async function loadDataFile(file: File): Promise<DataTable> {
  const body = new FormData();
  body.append("file", file);

  const token = getToken();
  const res = await fetch(`${API_BASE}/files/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Tu sesión expiró. Vuelve a entrar desde Ibero Data para subir archivos.");
    }
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      (payload as { message?: string }).message ??
        `Error ${res.status} al subir ${file.name}`,
    );
  }

  const data: UploadResponse = await res.json();

  return {
    name: data.tableName,
    columns: data.columns,
    rowCount: data.rowCount,
    fileSize: data.size,
    fileType: file.name.split(".").pop()?.toLowerCase(),
    filename: data.filename,
  };
}

export async function loadMultipleFiles(
  files: FileList | File[],
): Promise<DataTable[]> {
  const settled = await Promise.allSettled(
    Array.from(files).map((f) => loadDataFile(f)),
  );

  return settled.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    console.error("Error al cargar archivo:", result.reason);
    return [];
  });
}

export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupported(filename: string): boolean {
  return ["csv", "tsv", "parquet", "json", "jsonl", "geojson", "topojson"].includes(
    getFileExtension(filename),
  );
}
