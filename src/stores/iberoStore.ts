import "@/lib/legacyStorage";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IberoContext {
  apiUrl: string;
  organizationId: string;
  organizationName: string;
  datasetId: string;
  datasetTitle: string;
  resourceId?: string;
  resourceName?: string;
  analysisId?: string;
  analysisTitle?: string;
  analysisSlug?: string;
  analysisFolder?: string;
  analysisVisibility?: "PRIVATE" | "PUBLIC";
  analysisDescription?: string;
  publishToken?: string;
  /** False when the Ibero Data user may explore but not save analyses (no ADMIN or EDITOR role). */
  canPublish: boolean;
}

export interface IberoTableRef {
  resourceId: string;
  datasetId: string;
}

interface IberoState {
  context: IberoContext | null;
  tables: Record<string, IberoTableRef>;
  setContext: (context: IberoContext | null) => void;
  registerTable: (tableName: string, ref: IberoTableRef) => void;
  setAnalysis: (analysisId: string, analysisTitle: string, metadata?: Partial<IberoContext>) => void;
}

let clearLocalIbero: () => void;

export function forgetLocalIbero(): void {
  clearLocalIbero();
}

export const useIberoStore = create<IberoState>()((setLocal, getLocal, api) => {
  clearLocalIbero = () => setLocal({ context: null, tables: {} });
  return persist<IberoState>(
    (set) => ({
      context: null,
      tables: {},
      setContext: (context) => set({ context, tables: {} }),
      registerTable: (tableName, ref) =>
        set((state) => ({ tables: { ...state.tables, [tableName]: ref } })),
      setAnalysis: (analysisId, analysisTitle, metadata) =>
        set((state) => (state.context ? { context: { ...state.context, ...metadata, analysisId, analysisTitle } } : state)),
    }),
    { name: 'vistrace-ibero' },
  )(setLocal, getLocal, api);
});

export function parseIberoContext(raw: unknown): IberoContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
  const apiUrl = str(c.apiUrl);
  const organizationId = str(c.organizationId);
  const datasetId = str(c.datasetId);
  if (!apiUrl || !organizationId || !datasetId) return null;
  return {
    apiUrl,
    organizationId,
    organizationName: str(c.organizationName) ?? '',
    datasetId,
    datasetTitle: str(c.datasetTitle) ?? '',
    resourceId: str(c.resourceId),
    resourceName: str(c.resourceName),
    analysisId: str(c.analysisId),
    analysisTitle: str(c.analysisTitle),
    analysisSlug: str(c.analysisSlug),
    analysisFolder: str(c.analysisFolder),
    analysisVisibility: c.analysisVisibility === "PUBLIC" || c.analysisVisibility === "PRIVATE" ? c.analysisVisibility : undefined,
    analysisDescription: typeof c.analysisDescription === "string" ? c.analysisDescription : undefined,
    publishToken: str(c.publishToken),
    // Contexts from before canPublish existed always carried a publish token.
    canPublish: c.canPublish !== false,
  };
}

export function canPublishToIbero(context: IberoContext | null): context is IberoContext & { publishToken: string } {
  if (!context?.canPublish || !context.publishToken) return false;
  try {
    const payload = JSON.parse(atob(context.publishToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function iberoWorkspace(context: IberoContext | null): string | undefined {
  return context ? `ibero:${context.organizationId}:${context.datasetId}` : undefined;
}
