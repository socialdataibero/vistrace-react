import { isTokenUsable, useAuthStore, type AuthUser } from "@/stores/authStore";
import { parseIberoContext, useIberoStore, type IberoContext } from "@/stores/iberoStore";
import { parsePersistedAppState } from "@/lib/persistence";
import { resourceIdFromDownloadUrl } from "@/lib/iberoPublish";
import { prepareIberoCanvas } from "@/lib/iberoCanvas";
import { apiFetch } from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";
export class IberoHandoffError extends Error {}

type BuildPipeline = (recipe: Record<string, unknown>, source: string, result: string, joins: Record<string, string>) => void;

export async function receiveIberoHandoff(params: URLSearchParams, buildPipeline: BuildPipeline, onImport: () => void): Promise<void> {
  sessionStorage.removeItem("vistrace-handoff");
  const response = await apiFetch(`${API_BASE}/users/ibero-sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoffToken: params.get("handoff") }),
  });
  const data = await response.json() as {
    token?: string;
    iberoDownloadToken?: string;
    user?: AuthUser;
    iberoContext?: unknown;
    ibero?: unknown;
    canvas?: { state?: unknown; tables?: { tableName: string; resourceId: string; downloadUrl: string }[] } | null;
  };
  if (!response.ok || !isTokenUsable(data.token ?? null)) {
    throw new IberoHandoffError("No se pudo validar el acceso desde Ibero Data. Vuelve a abrir vistrace desde Ibero Data.");
  }
  const token = data.token!;
  useAuthStore.getState().setSession(token, data.user ?? null, "ibero");
  const context = parseIberoContext(data.iberoContext ?? data.ibero);
  useIberoStore.getState().setContext(context);
  onImport();

  const importTable = async (url: string, name: string, format: string, resourceId?: string): Promise<string> => {
    if (useAuthStore.getState().token !== token) throw new IberoHandoffError("La sesión cambió. Inicia sesión de nuevo.");
    const res = await apiFetch(`${API_BASE}/tables/import-from-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url, tableName: name, format, downloadToken: data.iberoDownloadToken ?? "" }),
    });
    const body = await res.json() as { tableName?: string; message?: string };
    if (useAuthStore.getState().token !== token) throw new IberoHandoffError("La sesión cambió. Inicia sesión de nuevo.");
    if (!res.ok || !body.tableName) throw new IberoHandoffError(`No se pudo importar el recurso. ${body.message ?? `Error ${res.status}`}`);
    registerTable(context, body.tableName, resourceId ?? resourceIdFromDownloadUrl(url));
    return body.tableName;
  };

  const decode = (raw: string) => JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
  const resourceUrl = params.get("resource_url");
  const resourceName = params.get("resource_name");
  let resultTable = "resultado";
  if (resourceUrl && resourceName) resultTable = await importTable(resourceUrl, resourceName, params.get("resource_format") ?? "csv");

  if (data.canvas?.state) {
    const state = parsePersistedAppState(JSON.stringify(data.canvas.state));
    if (!state) throw new IberoHandoffError("El canvas recibido de Ibero Data no es válido.");
    const tableNames: Record<string, string> = {};
    for (const table of data.canvas.tables ?? []) {
      tableNames[table.tableName] = await importTable(table.downloadUrl, table.tableName, "parquet", table.resourceId);
    }
    const incoming = prepareIberoCanvas(state, tableNames, context?.analysisId);
    sessionStorage.setItem("vistrace-handoff", JSON.stringify(incoming));
  } else {
    const sourceUrl = params.get("source_resource_url");
    const sourceName = params.get("source_resource_name");
    const sourceTable = sourceUrl && sourceName ? await importTable(sourceUrl, sourceName, "parquet") : null;
    const joins: Record<string, string> = {};
    const rawJoins = params.get("join_resources");
    if (rawJoins) {
      for (const join of decode(rawJoins) as { alias: string; url: string; name: string }[]) {
        joins[join.alias] = await importTable(join.url, join.name, "parquet");
      }
    }
    const pipeline = params.get("pipeline");
    if (pipeline) {
      if (!sourceTable) throw new IberoHandoffError("No se pudo importar la tabla de origen del análisis.");
      buildPipeline(decode(pipeline) as Record<string, unknown>, sourceTable, resultTable, joins);
    }
  }
}

function registerTable(context: IberoContext | null, tableName: string, resourceId: string | null): void {
  if (context && resourceId) useIberoStore.getState().registerTable(tableName, { resourceId, datasetId: context.datasetId });
}
