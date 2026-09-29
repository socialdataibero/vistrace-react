"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";
import { useDuckDB } from "@/hooks/useDuckDB";
import { canvasStoreApi, useCanvasStore } from "@/stores/canvasStore";
import { useDataStore } from "@/stores/dataStore";
import { useUIStore } from "@/stores/uiStore";
import { useDagStore, dagStoreApi } from "@/stores/dagStore";
import InfiniteCanvas from "./InfiniteCanvas";
import Toolbar from "./Toolbar";
import DataPanel from "@/components/panels/DataPanel";
import StylePanel from "@/components/panels/StylePanel";
import TitleCard from "@/components/panels/TitleCard";
import AIPanel from "@/components/panels/AIPanel";
import PageTabs from "@/components/panels/PageTabs";
import ShortcutsModal from "@/components/ui/ShortcutsModal";
import UserMenu from "@/components/auth/UserMenu";
import Dialog from "@/components/ui/Dialog";
import { NodeType, FromConfig } from "@/types/nodes";
import { CanvasFrame } from "@/types/canvas";
import { buildDeletedPageState, buildDuplicatedPageState } from "@/lib/canvasPages";
import {
  buildCenteredDownstreamNodePosition,
  buildFirstNodeVerticalPosition,
  buildLaneDownstreamNodePosition,
  findPreferredAnchorNodeId,
  findAvailableNodePosition,
} from "@/lib/canvasPlacement";
import {
  buildFrameBoundsFromNodeRects,
  getBaseCanvasNodeHeight,
  getCanvasNodeHeight,
  getCanvasPlacementHeight,
  getCanvasNodeWidth,
  getLiveCanvasNodeRect,
  normalizeFrameMembership,
} from "@/lib/canvasLayout";
import { getDefaultNodeConfig } from "@/lib/nodeConfig";
import {
  buildPersistedAppState,
  mergePersistedStates,
  parsePersistedAppState,
  PersistedAppState,
} from "@/lib/persistence";
import { fetchRemoteCanvasState, saveRemoteCanvasState } from "@/db/canvasState";
import { createShare } from "@/db/shares";
import { clearHydratedNodeExecution, hasReferencedSampleData } from "@/lib/canvasAIHelpers";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { useCanvasPresentation } from "@/hooks/useCanvasPresentation";
import { useVizCanvasIO } from "@/hooks/useVizCanvasIO";
import { useMapFlowCreation } from "@/hooks/useMapFlowCreation";
import { useAIPlanOrchestration } from "@/hooks/useAIPlanOrchestration";
import { v4 as uuidv4 } from "uuid";
import IberoPublishDialog from "@/components/panels/IberoPublishDialog";
import { useIberoStore } from "@/stores/iberoStore";
import { FiUploadCloud } from "react-icons/fi";

export default function CanvasApp({ guestSnapshot = null }: { guestSnapshot?: PersistedAppState | null } = {}) {
  const isGuest = Boolean(guestSnapshot);
  const { ready, loading, error } = useDuckDB({ skip: isGuest });
  const canvasId = useCanvasStore((s) => s.id);
  const title = useCanvasStore((s) => s.title);
  const pages = useCanvasStore((s) => s.pages);
  const focusMode = useCanvasStore((s) => s.focusMode);
  const toggleFocusMode = useCanvasStore((s) => s.toggleFocusMode);
  const shortcutsModalOpen = useUIStore((s) => s.shortcutsModalOpen);
  const toggleShortcutsModal = useUIStore((s) => s.toggleShortcutsModal);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const dataPanelOpen = useUIStore((s) => s.dataPanelOpen);
  const stylePanelOpen = useUIStore((s) => s.stylePanelOpen);
  const aiPanelOpen = useUIStore((s) => s.aiPanelOpen);
  const tables = useDataStore((s) => s.tables);
  const uploadFile = useDataStore((s) => s.uploadFile);
  const currentPageId = useCanvasStore((s) => s.currentPageId);
  const addNode = useDagStore((s) => s.addNode);
  const nodes = useDagStore((s) => s.nodes);
  const edges = useDagStore((s) => s.edges);

  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodeSizes, setNodeSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [frames, setFrames] = useState<CanvasFrame[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string; type?: "info" | "error" | "warning" } | null>(null);
  const sampleDataRestoreAttemptedRef = useRef(false);
  const framesRef = useRef<CanvasFrame[]>([]);
  const handoffRawRef = useRef<string | null>(null);
  const iberoContext = useIberoStore((s) => s.context);
  const [iberoPublishOpen, setIberoPublishOpen] = useState(false);

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    const nextPositionUpdates: Record<string, { x: number; y: number }> = {};

    setNodeSizes((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const [nodeId, node] of Object.entries(nodes)) {
        const minHeight = getBaseCanvasNodeHeight(node.type);
        const currentSize = prev[nodeId];
        const currentHeight = currentSize?.height ?? minHeight;
        if (currentHeight >= minHeight) continue;

        next[nodeId] = {
          width: currentSize?.width ?? getCanvasNodeWidth(node.type),
          height: minHeight,
        };

        const currentPosition = nodePositions[nodeId];
        if (currentPosition) {
          nextPositionUpdates[nodeId] = {
            x: currentPosition.x,
            y: Math.round(currentPosition.y - (minHeight - currentHeight) / 2),
          };
        }
        changed = true;
      }

      return changed ? next : prev;
    });

    if (Object.keys(nextPositionUpdates).length > 0) {
      setNodePositions((prev) => ({
        ...prev,
        ...nextPositionUpdates,
      }));
    }
  }, [nodePositions, nodes]);

  const buildCurrentPersistedState = useCallback(() => buildPersistedAppState({
    nodePositions,
    nodeSizes,
    frames,
    canvas: {
      id: canvasId,
      title,
      pages,
      currentPageId,
      focusMode,
    },
    dag: {
      nodes,
      edges,
    },
  }), [canvasId, currentPageId, edges, focusMode, frames, nodePositions, nodeSizes, nodes, pages, title]);

  const buildRemoteSaveState = useCallback(() => buildPersistedAppState({
    nodePositions,
    nodeSizes,
    frames,
    canvas: {
      id: canvasId,
      title,
      pages,
      currentPageId,
      focusMode,
    },
    dag: {
      nodes: clearHydratedNodeExecution(nodes),
      edges,
    },
  }), [canvasId, currentPageId, edges, focusMode, frames, nodePositions, nodeSizes, nodes, pages, title]);

  const persistCanvasStateNow = useCallback(() => {
    if (!hydrated || isGuest) return;
    void saveRemoteCanvasState(buildRemoteSaveState()).catch((err) => {
      console.warn("[persist] No se pudo guardar el canvas:", err);
    });
  }, [hydrated, isGuest, buildRemoteSaveState]);

  useEffect(() => {
    if (!hydrated || isGuest) return;
    const timeout = setTimeout(() => {
      void saveRemoteCanvasState(buildRemoteSaveState()).catch((err) => {
        console.warn("[persist] Autosave del canvas falló:", err);
      });
    }, 1500);
    return () => clearTimeout(timeout);
  }, [hydrated, isGuest, buildRemoteSaveState]);

  const handleSaveSnapshot = useCallback(() => {
    const snapshotData = JSON.stringify(buildCurrentPersistedState());
    canvasStoreApi.getState().saveSnapshot(snapshotData, title);
  }, [buildCurrentPersistedState, title]);

  const buildHistoryState = useCallback(() => ({
    ...buildPersistedAppState({
      nodePositions,
      nodeSizes,
      frames,
      canvas: {
        id: canvasId,
        title,
        pages,
        currentPageId,
        focusMode,
      },
      dag: {
        nodes: clearHydratedNodeExecution(nodes),
        edges,
      },
    }),
    savedAt: "history",
  }), [canvasId, currentPageId, edges, focusMode, frames, nodePositions, nodeSizes, nodes, pages, title]);

  const applyPersistedState = useCallback((state: PersistedAppState) => {
    sampleDataRestoreAttemptedRef.current = false;
    setNodePositions(state.nodePositions);
    setNodeSizes(state.nodeSizes ?? {});
    const restoredNodes = clearHydratedNodeExecution(state.dag.nodes);
    const restoredFrames = normalizeFrameMembership(
      state.frames ?? [],
      restoredNodes,
      state.nodePositions,
      state.nodeSizes ?? {}
    );
    setFrames(restoredFrames);
    canvasStoreApi.setState({
      id: state.canvas.id,
      title: state.canvas.title,
      pages: state.canvas.pages,
      currentPageId: state.canvas.currentPageId,
      focusMode: state.canvas.focusMode,
    });
    dagStoreApi.setState({
      nodes: restoredNodes,
      edges: state.dag.edges,
    });
    setSelectedNode(null);
  }, [setSelectedNode]);
  const applyGuestState = useCallback((state: PersistedAppState) => {
    setNodePositions(state.nodePositions);
    setNodeSizes(state.nodeSizes ?? {});
    const restoredNodes = state.dag.nodes;
    const restoredFrames = normalizeFrameMembership(
      state.frames ?? [],
      restoredNodes,
      state.nodePositions,
      state.nodeSizes ?? {}
    );
    setFrames(restoredFrames);
    canvasStoreApi.setState({
      id: state.canvas.id,
      title: state.canvas.title,
      pages: state.canvas.pages,
      currentPageId: state.canvas.currentPageId,
      focusMode: false,
    });
    dagStoreApi.setState({
      nodes: restoredNodes,
      edges: state.dag.edges,
    });
    setSelectedNode(null);
  }, [setSelectedNode]);

  const handleSharePage = useCallback(async () => {
    const liveNodes = dagStoreApi.getState().nodes;
    const pageNodeEntries = Object.entries(liveNodes).filter(
      ([, node]) => node.pageId === currentPageId
    );
    if (pageNodeEntries.length === 0) {
      setDialog({ type: "warning", title: "Nada que compartir", message: "Esta página no tiene nodos todavía." });
      return;
    }
    const pageNodeIds = new Set(pageNodeEntries.map(([id]) => id));
    const pageNodes = Object.fromEntries(pageNodeEntries);
    const pageEdges = edges.filter(
      (e) => pageNodeIds.has(e.fromNodeId) && pageNodeIds.has(e.toNodeId)
    );
    const pagePositions = Object.fromEntries(
      Object.entries(nodePositions).filter(([id]) => pageNodeIds.has(id))
    );
    const pageSizes = Object.fromEntries(
      Object.entries(nodeSizes).filter(([id]) => pageNodeIds.has(id))
    );
    const pageFrames = frames.filter((f) => f.pageId === currentPageId);
    const currentPage = pages.find((p) => p.id === currentPageId);

    const snapshot = buildPersistedAppState({
      nodePositions: pagePositions,
      nodeSizes: pageSizes,
      frames: pageFrames,
      canvas: {
        id: canvasId,
        title,
        pages: currentPage ? [{ ...currentPage, order: 0 }] : pages,
        currentPageId,
        focusMode: false,
      },
      dag: { nodes: pageNodes, edges: pageEdges },
    });

    try {
      const { url } = await createShare(snapshot);
      await navigator.clipboard?.writeText(url).catch(() => {});
      setDialog({
        type: "info",
        title: "Enlace de solo lectura creado",
        message: `Copiado al portapapeles. Válido para un invitado único (24 h):\n\n${url}`,
      });
    } catch (err) {
      setDialog({
        type: "error",
        title: "No se pudo compartir",
        message: err instanceof Error ? err.message : "Error al crear el enlace",
      });
    }
  }, [canvasId, currentPageId, edges, frames, nodePositions, nodeSizes, pages, title]);

  const handleRestoreSnapshot = useCallback(async (snapshotId: string) => {
    const snapshot = canvasStoreApi.getState().snapshots.find((entry) => entry.id === snapshotId);
    if (!snapshot) {
      setDialog({ type: "error", title: "Snapshot no encontrado", message: "No se encontró el snapshot seleccionado." });
      return;
    }

    const parsedState = parsePersistedAppState(snapshot.data);
    if (!parsedState) {
      setDialog({ type: "error", title: "Formato inválido", message: "El snapshot guardado no tiene un formato válido." });
      return;
    }

    applyPersistedState(parsedState);
    await dagStoreApi.getState().executeAll();
  }, [applyPersistedState]);

  const { undoCanvas, redoCanvas } = useCanvasHistory({
    hydrated,
    buildHistoryState,
    applyHistoryState: applyPersistedState,
    onAfterRestore: async () => {
      await dagStoreApi.getState().executeAll();
    },
  });

  const {
    presentationMode: derivedPresentationMode,
    presentationFrameId,
    sharedNodeIds,
    presentationTitle,
    showPresentationTitle,
  } = useCanvasPresentation({
    hydrated,
    currentPageId,
    pages,
    frames,
    nodes,
    setCurrentPage: (pageId) => canvasStoreApi.getState().setCurrentPage(pageId),
  });

  const presentationMode = derivedPresentationMode || isGuest;

  const handleAddNode = useCallback((type: NodeType, position?: { x: number; y: number }) => {
    const config = getDefaultNodeConfig(type);
    const nodeId = addNode(type, config, currentPageId);
    const pageNodes = Object.entries(nodes).filter(([, node]) => node.pageId === currentPageId);
    const pageNodeCount = pageNodes.length;
    const pageVisibleNodes = Object.fromEntries(pageNodes);
    const anchorNodeId = findPreferredAnchorNodeId({
      selectedNodeId,
      visibleNodes: pageVisibleNodes,
      nodePositions,
      nodeSizes,
      getNodeWidth: (nodeType) => getCanvasNodeWidth(nodeType as NodeType),
    });
    const anchorNode = anchorNodeId ? nodes[anchorNodeId] : undefined;
    const anchorNodePosition = anchorNodeId ? nodePositions[anchorNodeId] : undefined;
    const pos = position || (
      pageNodeCount === 0 && typeof window !== "undefined"
        ? buildFirstNodeVerticalPosition({
            surfaceHeight: window.innerHeight,
            nodeHeight: getCanvasNodeHeight(type, "", {}),
          })
        : anchorNode &&
            anchorNode.pageId === currentPageId &&
            anchorNodeId &&
            anchorNodePosition
          ? findAvailableNodePosition({
              type,
              preferredPosition: buildCenteredDownstreamNodePosition({
                sourcePosition: anchorNodePosition,
                sourceSize: {
                  width: nodeSizes[anchorNodeId]?.width ?? getCanvasNodeWidth(anchorNode.type),
                  height: nodeSizes[anchorNodeId]?.height ?? getCanvasNodeHeight(anchorNode.type, "", {}),
                },
                targetHeight: getCanvasPlacementHeight(type),
                targetType: type,
              }),
              visibleNodes: pageVisibleNodes,
              nodePositions,
              nodeSizes,
              getNodeWidth: (nodeType) => getCanvasNodeWidth(nodeType as NodeType),
              getNodeHeight: (nodeType) => getCanvasNodeHeight(nodeType as NodeType, "", {}),
            })
        : { x: 200 + Math.random() * 400, y: 200 + Math.random() * 300 }
    );
    setNodePositions((prev) => ({ ...prev, [nodeId]: pos }));
    return nodeId;
  }, [addNode, currentPageId, nodePositions, nodeSizes, nodes, selectedNodeId]);

  const handleAddToolbarNode = useCallback((type: NodeType) => {
    const pageNodes = Object.entries(nodes).filter(([, node]) => node.pageId === currentPageId);
    const pageVisibleNodes = Object.fromEntries(pageNodes);
    const anchorNodeId = findPreferredAnchorNodeId({
      selectedNodeId,
      visibleNodes: pageVisibleNodes,
      nodePositions,
      nodeSizes,
      getNodeWidth: (nodeType) => getCanvasNodeWidth(nodeType as NodeType),
    }) ?? undefined;

    if (!anchorNodeId) {
      return handleAddNode(type);
    }

    const anchorNode = nodes[anchorNodeId];
    const anchorNodePosition = nodePositions[anchorNodeId];
    if (!anchorNode || anchorNode.pageId !== currentPageId || !anchorNodePosition) {
      return handleAddNode(type);
    }

    const preferredPosition = findAvailableNodePosition({
      type,
      preferredPosition: buildLaneDownstreamNodePosition({
        sourcePosition: anchorNodePosition,
        sourceSize: {
          width: nodeSizes[anchorNodeId]?.width ?? getCanvasNodeWidth(anchorNode.type),
          height: nodeSizes[anchorNodeId]?.height ?? getCanvasNodeHeight(anchorNode.type, "", {}),
        },
      }),
      visibleNodes: pageVisibleNodes,
      nodePositions,
      nodeSizes,
      getNodeWidth: (nodeType) => getCanvasNodeWidth(nodeType as NodeType),
      getNodeHeight: (nodeType) => getCanvasNodeHeight(nodeType as NodeType, "", {}),
    });

    return handleAddNode(type, preferredPosition);
  }, [currentPageId, handleAddNode, nodePositions, nodeSizes, nodes, selectedNodeId]);

  const handleSelectPage = useCallback((pageId: string) => {
    canvasStoreApi.getState().setCurrentPage(pageId);
    setSelectedNode(null);
  }, [setSelectedNode]);

  const handleAddPage = useCallback(() => {
    const pageId = canvasStoreApi.getState().addPage();
    setSelectedNode(null);
    return pageId;
  }, [setSelectedNode]);

  const handleRenamePage = useCallback((pageId: string, name: string) => {
    canvasStoreApi.getState().renamePage(pageId, name);
  }, []);

  const handleDeletePage = useCallback((pageId: string) => {
    const canvasState = canvasStoreApi.getState();
    const dagState = dagStoreApi.getState();
    const nextState = buildDeletedPageState({
      pageId,
      pages: canvasState.pages,
      currentPageId: canvasState.currentPageId,
      nodes: dagState.nodes,
      edges: dagState.edges,
      nodePositions,
      nodeSizes,
      frames,
      selectedNodeId,
    });

    if (!nextState) return;

    dagStoreApi.setState({
      nodes: nextState.nodes,
      edges: nextState.edges,
    });
    setNodePositions(nextState.nodePositions);
    setNodeSizes(nextState.nodeSizes);
    setFrames(nextState.frames);
    canvasStoreApi.setState({
      pages: nextState.pages,
      currentPageId: nextState.currentPageId,
    });

    if (nextState.shouldClearSelectedNode) {
      setSelectedNode(null);
    }
  }, [frames, nodePositions, nodeSizes, selectedNodeId, setSelectedNode]);

  const handleDuplicatePage = useCallback((pageId: string) => {
    const canvasState = canvasStoreApi.getState();
    const dagState = dagStoreApi.getState();
    const nextState = buildDuplicatedPageState({
      pageId,
      pages: canvasState.pages,
      nodes: dagState.nodes,
      edges: dagState.edges,
      nodePositions,
      nodeSizes,
      frames,
      generateId: uuidv4,
    });

    if (!nextState) return pageId;

    dagStoreApi.setState({
      nodes: nextState.nodes,
      edges: nextState.edges,
    });
    setNodePositions(nextState.nodePositions);
    setNodeSizes(nextState.nodeSizes);
    setFrames(nextState.frames);
    canvasStoreApi.setState({
      pages: nextState.pages,
      currentPageId: nextState.currentPageId,
    });

    setSelectedNode(null);
    setTimeout(() => {
      void dagStoreApi.getState().executeAll();
    }, 0);

    return nextState.newPageId;
  }, [frames, nodePositions, nodeSizes, setSelectedNode]);

  const {
    exportVizCanvas: handleExportVizCanvas,
    importVizCanvas: handleImportVizCanvas,
  } = useVizCanvasIO({
    title,
    buildCurrentPersistedState,
    applyPersistedState,
  });

  const handleAddFromNode = useCallback((tableName: string) => {
    const config: FromConfig = { tableName, filters: [] };
    const nodeId = addNode("from", config, currentPageId);
    const pageNodeCount = Object.values(nodes).filter((node) => node.pageId === currentPageId).length;
    const pos = pageNodeCount === 0 && typeof window !== "undefined"
      ? buildFirstNodeVerticalPosition({
          surfaceHeight: window.innerHeight,
          nodeHeight: getCanvasNodeHeight("from", "", {}),
        })
      : { x: 200 + Math.random() * 400, y: 200 + Math.random() * 300 };
    setNodePositions((prev) => ({ ...prev, [nodeId]: pos }));
    setTimeout(() => dagStoreApi.getState().executeNode(nodeId), 100);
  }, [addNode, currentPageId, nodes]);

  const handleCreateMapFlow = useMapFlowCreation({
    addNode,
    currentPageId,
    nodes,
    nodePositions,
    nodeSizes,
    tables,
    setNodePositions,
    setSelectedNode,
    onError: (title, message) => setDialog({ type: "error", title, message }),
  });

  const handleNodeMove = useCallback((nodeId: string, x: number, y: number) => {
    setNodePositions((prev) => ({ ...prev, [nodeId]: { x, y } }));
  }, []);

  const handleNodeResize = useCallback((
    nodeId: string,
    size: { width: number; height: number },
    position?: { x: number; y: number }
  ) => {
    setNodeSizes((prev) => ({ ...prev, [nodeId]: size }));
    if (position) {
      setNodePositions((prev) => ({ ...prev, [nodeId]: position }));
    }
  }, []);

  const createFrameFromNodeIds = useCallback((nodeIds: string[], name?: string) => {
    const scopedNodes = Array.from(new Set(nodeIds))
      .map((nodeId) => {
        const node = nodes[nodeId];
        if (!node || node.pageId !== currentPageId) return null;
        return getLiveCanvasNodeRect(node, nodeId, nodePositions, nodeSizes);
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (scopedNodes.length === 0) return null;

    const scopedNodeIds = scopedNodes.map((entry) => entry.id);
    const bounds = buildFrameBoundsFromNodeRects(scopedNodes);
    if (!bounds) return null;
    const frameId = uuidv4();
    const nextFrame: CanvasFrame = {
      id: frameId,
      pageId: currentPageId,
      name: name || `Frame ${frames.filter((frame) => frame.pageId === currentPageId).length + 1}`,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      nodeIds: scopedNodeIds,
    };

    setFrames((prev) => [...prev, nextFrame]);
    return frameId;
  }, [currentPageId, frames, nodePositions, nodeSizes, nodes]);

  const handleMoveFrame = useCallback((frameId: string, x: number, y: number) => {
    const currentFrame = framesRef.current.find((frame) => frame.id === frameId);
    if (!currentFrame) return;

    const nextX = Math.round(x);
    const nextY = Math.round(y);
    const deltaX = nextX - currentFrame.x;
    const deltaY = nextY - currentFrame.y;

    if (deltaX === 0 && deltaY === 0) return;

    setFrames((prev) => prev.map((frame) => (
      frame.id === frameId ? { ...frame, x: nextX, y: nextY } : frame
    )));

    if (currentFrame.nodeIds.length === 0) return;

    setNodePositions((prevPositions) => {
      const nextPositions = { ...prevPositions };
      for (const nodeId of currentFrame.nodeIds) {
        const current = prevPositions[nodeId];
        if (!current) continue;
        nextPositions[nodeId] = {
          x: Math.round(current.x + deltaX),
          y: Math.round(current.y + deltaY),
        };
      }
      return nextPositions;
    });
  }, []);

  const handleDeleteFrame = useCallback((frameId: string) => {
    setFrames((prev) => prev.filter((frame) => frame.id !== frameId));
  }, []);

  const handleRenameFrame = useCallback((frameId: string, name: string) => {
    setFrames((prev) => prev.map((frame) => (
      frame.id === frameId ? { ...frame, name: name.trim() || frame.name } : frame
    )));
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    dagStoreApi.getState().removeNode(nodeId);
    setNodePositions((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    setNodeSizes((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    setFrames((prev) =>
      prev.map((frame) => ({
        ...frame,
        nodeIds: frame.nodeIds.filter((memberNodeId) => memberNodeId !== nodeId),
      }))
    );
  }, []);

  useEffect(() => {
    if (!hydrated || typeof document === "undefined" || frames.length === 0) return;

    const frameRequest = window.requestAnimationFrame(() => {
      setFrames((prev) => {
        let hasChanges = false;

        const nextFrames = prev.map((frame) => {
          const memberRects = frame.nodeIds
            .map((nodeId) => {
              const node = nodes[nodeId];
              if (!node || node.pageId !== frame.pageId) return null;
              return getLiveCanvasNodeRect(node, nodeId, nodePositions, nodeSizes);
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

          const expectedBounds = buildFrameBoundsFromNodeRects(memberRects);
          if (!expectedBounds) return frame;

          if (
            expectedBounds.x === frame.x &&
            expectedBounds.y === frame.y &&
            expectedBounds.width === frame.width &&
            expectedBounds.height === frame.height
          ) {
            return frame;
          }

          hasChanges = true;
          return {
            ...frame,
            x: expectedBounds.x,
            y: expectedBounds.y,
            width: expectedBounds.width,
            height: expectedBounds.height,
          };
        });

        return hasChanges ? nextFrames : prev;
      });
    });

    return () => window.cancelAnimationFrame(frameRequest);
  }, [frames, hydrated, nodePositions, nodeSizes, nodes]);

  const applyAIPlan = useAIPlanOrchestration({
    addNode,
    currentPageId,
    nodePositions,
    nodeSizes,
    selectedNodeId,
    tables,
    setNodePositions,
    setSelectedNode,
  });

  useEffect(() => {
    if (hydrated) return;
    if (guestSnapshot) {
      applyGuestState(guestSnapshot);
      setHydrated(true);
      return;
    }

    const stored = sessionStorage.getItem("vizcanvas-handoff");
    if (stored) handoffRawRef.current = stored;
    sessionStorage.removeItem("vizcanvas-handoff");
    const handoffRaw = handoffRawRef.current;
    const authRaw = localStorage.getItem("vizcanvas-auth");
    localStorage.clear();
    if (authRaw) localStorage.setItem("vizcanvas-auth", authRaw);

    let cancelled = false;
    void (async () => {
      const remote = await fetchRemoteCanvasState().catch(() => null);
      if (cancelled) return;
      const blankPageId = uuidv4();
      const blankState = buildPersistedAppState({
        nodePositions: {},
        nodeSizes: {},
        frames: [],
        canvas: {
          id: uuidv4(),
          title: "Untitled Canvas",
          pages: [{ id: blankPageId, name: "Page 1", order: 0 }],
          currentPageId: blankPageId,
          focusMode: false,
        },
        dag: { nodes: {}, edges: [] },
      });

      const handoffState = handoffRaw ? parsePersistedAppState(handoffRaw) : null;
      canvasStoreApi.setState({ snapshots: [] });
      if (handoffState && remote) {
        applyPersistedState(mergePersistedStates(remote, handoffState));
      } else if (handoffState) {
        applyPersistedState(handoffState);
      } else {
        applyPersistedState(remote ?? blankState);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, applyPersistedState, guestSnapshot, applyGuestState]);

  useEffect(() => {
    if (!hydrated || !ready || isGuest) return;
    if (sampleDataRestoreAttemptedRef.current) return;

    const currentNodes = dagStoreApi.getState().nodes;
    const sampleDataLoaded = tables.some((table) => table.name === "sample_data");
    if (!hasReferencedSampleData(currentNodes) || sampleDataLoaded) return;

    sampleDataRestoreAttemptedRef.current = true;
    void (async () => {
      try {
        const response = await fetch("/sample_data.csv", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`No se pudo cargar sample_data.csv (${response.status})`);
        }

        const blob = await response.blob();
        await uploadFile(new File([blob], "sample_data.csv", { type: "text/csv" }));
      } catch (restoreError) {
        console.error("Failed to restore sample_data after hydration:", restoreError);
        sampleDataRestoreAttemptedRef.current = false;
      }
    })();
  }, [hydrated, ready, tables, uploadFile]);

  useEffect(() => {
    if (!hydrated || !ready || isGuest) return;
    void dagStoreApi.getState().executeAll();
  }, [hydrated, ready, isGuest, tables]);

  if (loading && !ready && !isGuest) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-gray-500">Initializing DuckDB...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-red-600">Error initializing: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <InfiniteCanvas
        nodePositions={nodePositions}
        nodeSizes={nodeSizes}
        frames={frames}
        presentationMode={presentationMode}
        presentationFrameId={presentationFrameId}
        linkedNodeIds={sharedNodeIds}
        onNodeMove={handleNodeMove}
        onNodeResize={handleNodeResize}
        onDeleteNode={handleDeleteNode}
        onAddNode={handleAddNode}
        onCreateFrameFromSelection={createFrameFromNodeIds}
        onMoveFrame={handleMoveFrame}
        onDeleteFrame={handleDeleteFrame}
        onRenameFrame={handleRenameFrame}
        undoCanvas={undoCanvas}
        redoCanvas={redoCanvas}
        toggleFocusMode={toggleFocusMode}
        persistCanvasStateNow={persistCanvasStateNow}
      />

      {presentationMode && showPresentationTitle && presentationTitle && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-4">
          <div className="rounded-full border border-white/80 bg-white/92 px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg backdrop-blur">
            {presentationTitle}
          </div>
        </div>
      )}

      {!(focusMode || presentationMode) && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 z-20 flex flex-col gap-2 p-3">
            <div className="pointer-events-auto">
              <TitleCard
                onSaveSnapshot={handleSaveSnapshot}
                onRestoreSnapshot={(snapshotId) => { void handleRestoreSnapshot(snapshotId); }}
                onExportVizCanvas={handleExportVizCanvas}
                onImportVizCanvas={handleImportVizCanvas}
                onSharePage={handleSharePage}
              />
            </div>
            {dataPanelOpen && (
              <div className="pointer-events-auto">
                <DataPanel onAddFromNode={handleAddFromNode} onCreateMapFlow={handleCreateMapFlow} />
              </div>
            )}
          </div>

          {/* Top Right - User Menu + Style Panel */}
          <div className="pointer-events-none absolute right-0 top-0 z-20 flex flex-col items-end gap-2 p-3">
            <div className="pointer-events-auto flex items-center gap-2">
              {iberoContext && !isGuest && (
                <button
                  onClick={() => setIberoPublishOpen(true)}
                  title={`${iberoContext.organizationName} / ${iberoContext.datasetTitle}`}
                  className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-teal-700 shadow-md ring-1 ring-slate-200 transition hover:bg-teal-50"
                >
                  <FiUploadCloud size={15} />
                  Guardar en Ibero Data
                </button>
              )}
              <UserMenu />
            </div>
            {stylePanelOpen && (
              <div className="pointer-events-auto">
                <StylePanel />
              </div>
            )}
          </div>

          {/* Bottom Center - Toolbar */}
          <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 -translate-x-1/2 pb-4">
            <div className="pointer-events-auto">
              <Toolbar onAddNode={handleAddToolbarNode} />
            </div>
          </div>

          {/* Page Tabs - Bottom Left */}
          <div className="pointer-events-none absolute bottom-0 left-0 z-20 pb-4 pl-3">
              <div className="pointer-events-auto">
                <PageTabs
                  onSelectPage={handleSelectPage}
                  onAddPage={handleAddPage}
                  onRenamePage={handleRenamePage}
                  onDeletePage={handleDeletePage}
                  onDuplicatePage={handleDuplicatePage}
                />
              </div>
            </div>

          {/* Right Side - AI Panel */}
          {aiPanelOpen && (
            <div className="pointer-events-none absolute bottom-0 right-0 z-20 p-3 pb-4">
              <div className="pointer-events-auto">
                <AIPanel onApplyPlan={applyAIPlan} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Focus mode indicator */}
        {focusMode && !presentationMode && (
          <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
            <button
              onClick={toggleFocusMode}
              className="rounded-full bg-black/70 px-4 py-2 text-xs text-white backdrop-blur hover:bg-black/80"
            >
              {`Press ${typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) ? "\u2318" : "Ctrl"}+. to exit focus mode`}
            </button>
          </div>
        )}

      {/* Shortcuts Modal */}
      {shortcutsModalOpen && <ShortcutsModal onClose={toggleShortcutsModal} />}
      {iberoPublishOpen && (
        <IberoPublishDialog
          nodes={nodes}
          pages={pages}
          selectedNodeId={selectedNodeId}
          buildState={buildRemoteSaveState}
          onClose={() => setIberoPublishOpen(false)}
        />
      )}
      {dialog && (
        <Dialog
          open={true}
          title={dialog.title}
          message={dialog.message}
          type={dialog.type}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
