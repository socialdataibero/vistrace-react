export interface CanvasPage {
  id: string;
  name: string;
  order: number;
  iberoAnalysisId?: string;
  iberoSourcePageId?: string;
}

export interface CanvasFrame {
  id: string;
  pageId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
}

export interface CanvasState {
  id: string;
  title: string;
  pages: CanvasPage[];
  currentPageId: string;
  focusMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSnapshot {
  id: string;
  timestamp: string;
  label?: string;
  data: string; // JSON-serialized canvas state
}
