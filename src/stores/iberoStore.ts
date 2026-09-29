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
  publishToken?: string;
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
  setAnalysis: (analysisId: string, analysisTitle: string) => void;
}

export const useIberoStore = create<IberoState>()(
  persist(
    (set) => ({
      context: null,
      tables: {},
      setContext: (context) => set({ context }),
      registerTable: (tableName, ref) =>
        set((state) => ({ tables: { ...state.tables, [tableName]: ref } })),
      setAnalysis: (analysisId, analysisTitle) =>
        set((state) => (state.context ? { context: { ...state.context, analysisId, analysisTitle } } : state)),
    }),
    { name: 'vizcanvas-ibero' },
  ),
);

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
    publishToken: str(c.publishToken),
  };
}

export function canPublishToIbero(context: IberoContext | null): context is IberoContext & { publishToken: string } {
  if (!context?.publishToken) return false;
  try {
    const payload = JSON.parse(atob(context.publishToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
