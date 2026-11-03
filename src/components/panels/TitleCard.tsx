"use client";

import React, { useState, useRef, useEffect } from "react";
import { LuDownload, LuFolderArchive, LuKeyboard, LuShare2 } from "react-icons/lu";
import { createPortal } from "react-dom";
import { useCanvasStore } from "@/stores/canvasStore";
import { useUIStore } from "@/stores/uiStore";
import { CANVAS_VIEWPORT_CHANGE_EVENT } from "@/lib/canvasViewportEvents";
import Dialog from "@/components/ui/Dialog";

interface TitleCardProps {
  onSaveSnapshot?: () => void;
  onRestoreSnapshot?: (snapshotId: string) => void;
  onExportVistrace?: () => Promise<void> | void;
  onImportVistrace?: (file: File) => Promise<void> | void;
  onSharePage?: () => Promise<void> | void;
}

export default function TitleCard({
  onSaveSnapshot,
  onRestoreSnapshot,
  onExportVistrace,
  onImportVistrace,
  onSharePage,
}: TitleCardProps) {
  const title = useCanvasStore((s) => s.title);
  const setTitle = useCanvasStore((s) => s.setTitle);
  const snapshots = useCanvasStore((s) => s.snapshots);
  const toggleShortcutsModal = useUIStore((s) => s.toggleShortcutsModal);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"export" | "import" | "share" | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const clickedButton = target ? menuButtonRef.current?.contains(target) : false;
      const clickedMenu = target ? menuContentRef.current?.contains(target) : false;
      if (clickedButton || clickedMenu) return;
      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    const handleViewportChange = () => {
      setMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(CANVAS_VIEWPORT_CHANGE_EVENT, handleViewportChange);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(CANVAS_VIEWPORT_CHANGE_EVENT, handleViewportChange);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const updatePosition = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 240;
      const viewportPadding = 12;
      const left = Math.max(viewportPadding, rect.left);
      const top = Math.min(rect.bottom + 8, window.innerHeight - viewportPadding);

      setMenuPosition({
        top,
        left: Math.min(left, window.innerWidth - menuWidth - viewportPadding),
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [menuOpen]);

  const runMenuAction = async (action: "export" | "import" | "share", callback: () => Promise<void> | void) => {
    try {
      setBusyAction(action);
      await callback();
      setMenuOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo completar la acción.";
      setErrorDialog(message);
    } finally {
      setBusyAction(null);
    }
  };

  const recentSnapshots = [...snapshots]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 5);

  return (
    <div ref={rootRef} className="panel flex items-center gap-2 px-3 py-2 relative">
      {/* Menu button */}
      <button
        ref={menuButtonRef}
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100 text-gray-500"
      >
        ☰
      </button>

      {/* Title */}
      {editing ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
          className="border-b border-indigo-400 bg-transparent text-sm font-semibold outline-none px-1"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-semibold text-gray-800 hover:text-indigo-600 truncate max-w-[160px]"
        >
          {title}
        </button>
      )}

      {/* Logo badge */}
      <span className="ml-auto text-[10px] font-medium text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
        Canvas
      </span>

      <input
        ref={importInputRef}
        type="file"
        accept=".vistrace,.vzc,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !onImportVistrace) return;
          void runMenuAction("import", async () => {
            await onImportVistrace(file);
          });
          e.currentTarget.value = "";
        }}
      />

      {/* Dropdown menu */}
      {menuOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={menuContentRef}
          className="context-menu fixed"
          style={{ top: menuPosition.top, left: menuPosition.left, zIndex: 2000, minWidth: "240px" }}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              onSaveSnapshot?.();
              setMenuOpen(false);
            }}
          >
            💾 Save Snapshot
          </button>
          {recentSnapshots.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Recent Snapshots
              </div>
              <div className="flex flex-col gap-1 px-2 pb-2">
                {recentSnapshots.map((snapshot) => (
                  <button
                    key={snapshot.id}
                    className="rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                    onClick={() => {
                      onRestoreSnapshot?.(snapshot.id);
                      setMenuOpen(false);
                    }}
                  >
                    <div className="text-sm font-medium text-slate-700">
                      {snapshot.label?.trim() || title}
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(snapshot.timestamp).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
              <hr className="my-1 border-gray-200" />
            </>
          )}
          {onSharePage && (
            <button
              className="context-menu-item"
              disabled={busyAction === "share"}
              onClick={() => {
                void runMenuAction("share", async () => {
                  await onSharePage();
                });
              }}
            >
              <span className="inline-flex items-center gap-2">
                <LuShare2 className="h-4 w-4" />
                <span>{busyAction === "share" ? "Creando enlace..." : "Compartir página (solo lectura)"}</span>
              </span>
            </button>
          )}
          <button
            className="context-menu-item"
            disabled={busyAction === "export"}
            onClick={() => {
              if (!onExportVistrace) return;
              void runMenuAction("export", async () => {
                await onExportVistrace();
              });
            }}
          >
            <span className="inline-flex items-center gap-2">
              <LuFolderArchive className="h-4 w-4" />
              <span>{busyAction === "export" ? "Exporting .vistrace..." : "Export .vistrace"}</span>
            </span>
          </button>
          <button
            className="context-menu-item"
            disabled={busyAction === "import"}
            onClick={() => importInputRef.current?.click()}
          >
            <span className="inline-flex items-center gap-2">
              <LuDownload className="h-4 w-4" />
              <span>{busyAction === "import" ? "Importing .vistrace..." : "Import .vistrace"}</span>
            </span>
          </button>
          <button className="context-menu-item" onClick={() => { toggleShortcutsModal(); setMenuOpen(false); }}>
            <LuKeyboard className="h-4 w-4" /> Keyboard Shortcuts
          </button>
          <hr className="my-1 border-gray-200" />
          <button className="context-menu-item" onClick={() => setMenuOpen(false)}>
            ❌ Close
          </button>
        </div>,
        document.body
      )}
      <Dialog
        open={!!errorDialog}
        type="error"
        title="Error"
        message={errorDialog ?? ""}
        onClose={() => setErrorDialog(null)}
      />
    </div>
  );
}
