"use client";

import * as React from "react";
import { X, Minimize2, Maximize2 } from "lucide-react";
import { AddTaskForm } from "./AddTaskForm";
import {
  useTaskComposerStore,
  type TaskComposer,
  type TaskComposerDraft,
} from "../../store/task-composer-store";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

interface TaskComposerCardProps {
  composer: TaskComposer;
  onTaskCreated?: (task: any) => void;
  /** When "sheet", renders only form + discard dialog (no card chrome). Used inside MobileTaskComposerSheet. */
  variant?: "card" | "sheet";
}

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function getDisplayTitle(draft: TaskComposerDraft): string {
  const title = (draft.title || "").trim();
  if (title) return title.length > 40 ? title.slice(0, 40) + "…" : title;
  return "New task";
}

function hasMeaningfulDraftChanges(composer: TaskComposer): boolean {
  const fields: Array<keyof TaskComposerDraft> = ["title", "project_id_int", "project_status_id", "briefing"]
  return fields.some((field) => String(composer.draft[field] ?? "").trim() !== String(composer.initialDraft[field] ?? "").trim())
}

export function TaskComposerCard({ composer, onTaskCreated, variant = "card" }: TaskComposerCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragStateRef = React.useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizeStateRef = React.useRef<{
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const hasInitializedSizeRef = React.useRef(false);
  const hasManualEditsRef = React.useRef(false);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const [cardSize, setCardSize] = React.useState({ width: 520, height: 680 });
  const lastSyncedRef = React.useRef<{ title?: string; project_id_int?: string; project_status_id?: string; briefing?: string; dirty?: boolean } | null>(null);
  const updateDraft = useTaskComposerStore((s) => s.updateDraft);
  const setDirty = useTaskComposerStore((s) => s.setDirty);
  const minimizeComposer = useTaskComposerStore((s) => s.minimizeComposer);
  const expandComposer = useTaskComposerStore((s) => s.expandComposer);
  const requestCloseComposer = useTaskComposerStore((s) => s.requestCloseComposer);
  const forceCloseComposer = useTaskComposerStore((s) => s.forceCloseComposer);
  const confirmDiscard = useTaskComposerStore((s) => s.confirmDiscard);
  const cancelPendingClose = useTaskComposerStore((s) => s.cancelPendingClose);
  const pendingCloseId = useTaskComposerStore((s) => s.pendingCloseId);
  const isPendingClose = pendingCloseId === composer.id;
  const isSheet = variant === "sheet";
  const minWidth = 420;
  const minHeight = 420;

  // Sync form values to store for minimized bar
  const handleFormChange = React.useCallback(
    (values: Partial<Record<string, unknown>>, dirty: boolean) => {
      const next = {
        title: values.title as string,
        project_id_int: values.project_id_int as string,
        project_status_id: values.project_status_id as string,
        briefing: values.briefing as string,
        dirty,
      };
      const prev = lastSyncedRef.current;
      const unchanged =
        prev &&
        prev.title === next.title &&
        prev.project_id_int === next.project_id_int &&
        prev.project_status_id === next.project_status_id &&
        prev.briefing === next.briefing &&
        prev.dirty === next.dirty;
      if (unchanged) return;
      lastSyncedRef.current = next;
      updateDraft(composer.id, {
        title: next.title,
        project_id_int: next.project_id_int,
        project_status_id: next.project_status_id,
        briefing: next.briefing,
      });
      setDirty(composer.id, dirty);
    },
    [composer.id, updateDraft, setDirty]
  );

  const handleSuccess = React.useCallback(
    (task: any) => {
      onTaskCreated?.(task);
      if (composer.onSuccess) {
        void Promise.resolve(composer.onSuccess(task));
      }
      useTaskComposerStore.getState().forceCloseComposer(composer.id);
    },
    [composer.id, composer.onSuccess, onTaskCreated]
  );

  const handleCreateAndAddAnother = React.useCallback(
    (task: any) => {
      onTaskCreated?.(task);
      // Composer stays open; form resets inside AddTaskForm
    },
    [onTaskCreated]
  );

  const handleClose = React.useCallback(() => {
    if (!hasManualEditsRef.current) {
      forceCloseComposer(composer.id);
      return;
    }
    if (!composer.dirty || !hasMeaningfulDraftChanges(composer)) {
      forceCloseComposer(composer.id);
      return;
    }
    requestCloseComposer(composer.id);
  }, [composer, forceCloseComposer, requestCloseComposer]);

  // ESC to close
  React.useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!hasManualEditsRef.current) {
          forceCloseComposer(composer.id);
          return;
        }
        if (!composer.dirty || !hasMeaningfulDraftChanges(composer)) {
          forceCloseComposer(composer.id);
          return;
        }
        requestCloseComposer(composer.id);
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [composer, forceCloseComposer, requestCloseComposer]);

  // Focus title on expand
  React.useEffect(() => {
    if (!composer.isMinimized && titleInputRef.current) {
      titleInputRef.current.focus?.();
    }
  }, [composer.isMinimized]);

  const handleDragStart = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drag-handle='true']")) return;
    if (target.closest("button") || target.closest("[data-resize-handle='true']")) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
  }, [dragOffset.x, dragOffset.y]);

  const startResize = React.useCallback(
    (direction: ResizeDirection, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = null;
      resizeStateRef.current = {
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: cardSize.width,
        startHeight: cardSize.height,
        startOffsetX: dragOffset.x,
        startOffsetY: dragOffset.y,
      };
    },
    [cardSize.height, cardSize.width, dragOffset.x, dragOffset.y]
  );

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const resize = resizeStateRef.current;
      if (resize) {
        const dx = e.clientX - resize.startX;
        const dy = e.clientY - resize.startY;
        const maxWidth = Math.max(minWidth, window.innerWidth - 32);
        const maxHeight = Math.max(minHeight, window.innerHeight - 32);

        let nextWidth = resize.startWidth;
        let nextHeight = resize.startHeight;
        let nextOffsetX = resize.startOffsetX;
        let nextOffsetY = resize.startOffsetY;

        if (resize.direction.includes("e")) nextWidth = resize.startWidth + dx;
        if (resize.direction.includes("w")) {
          nextWidth = resize.startWidth - dx;
          nextOffsetX = resize.startOffsetX + dx;
        }
        if (resize.direction.includes("s")) nextHeight = resize.startHeight + dy;
        if (resize.direction.includes("n")) {
          nextHeight = resize.startHeight - dy;
          nextOffsetY = resize.startOffsetY + dy;
        }

        if (nextWidth < minWidth) {
          if (resize.direction.includes("w")) {
            nextOffsetX = resize.startOffsetX + (resize.startWidth - minWidth);
          }
          nextWidth = minWidth;
        }
        if (nextWidth > maxWidth) {
          if (resize.direction.includes("w")) {
            nextOffsetX = resize.startOffsetX + (resize.startWidth - maxWidth);
          }
          nextWidth = maxWidth;
        }
        if (nextHeight < minHeight) {
          if (resize.direction.includes("n")) {
            nextOffsetY = resize.startOffsetY + (resize.startHeight - minHeight);
          }
          nextHeight = minHeight;
        }
        if (nextHeight > maxHeight) {
          if (resize.direction.includes("n")) {
            nextOffsetY = resize.startOffsetY + (resize.startHeight - maxHeight);
          }
          nextHeight = maxHeight;
        }

        const clampedX = Math.max(-window.innerWidth + 120, Math.min(nextOffsetX, window.innerWidth - 120));
        const clampedY = Math.max(-window.innerHeight + 120, Math.min(nextOffsetY, window.innerHeight - 120));

        setCardSize({ width: nextWidth, height: nextHeight });
        setDragOffset({ x: clampedX, y: clampedY });
        return;
      }

      const drag = dragStateRef.current;
      if (!drag) return;
      const nextX = drag.originX + (e.clientX - drag.startX);
      const nextY = drag.originY + (e.clientY - drag.startY);
      const clampedX = Math.max(-320, Math.min(nextX, window.innerWidth - 120));
      const clampedY = Math.max(-window.innerHeight + 120, Math.min(nextY, window.innerHeight - 120));
      setDragOffset({ x: clampedX, y: clampedY });
    };
    const onUp = () => {
      dragStateRef.current = null;
      resizeStateRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minHeight, minWidth]);

  React.useEffect(() => {
    if (isSheet) return;
    const applyViewportDefaults = () => {
      const maxWidth = Math.max(minWidth, window.innerWidth - 32);
      const maxHeight = Math.max(minHeight, window.innerHeight - 32);
      const defaultWidth = Math.min(540, maxWidth);
      const defaultHeight = Math.min(Math.round(window.innerHeight * 0.62), maxHeight);
      setCardSize((prev) => {
        if (!hasInitializedSizeRef.current) {
          hasInitializedSizeRef.current = true;
          return { width: defaultWidth, height: defaultHeight };
        }
        return {
          width: Math.max(minWidth, Math.min(prev.width, maxWidth)),
          height: Math.max(minHeight, Math.min(prev.height, maxHeight)),
        };
      });
    };
    applyViewportDefaults();
    window.addEventListener("resize", applyViewportDefaults);
    return () => window.removeEventListener("resize", applyViewportDefaults);
  }, [isSheet, minHeight, minWidth]);

  const minimized = composer.isMinimized;

  const formAndDialog = (
    <>
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        onInputCapture={() => {
          hasManualEditsRef.current = true;
        }}
        onChangeCapture={() => {
          hasManualEditsRef.current = true;
        }}
      >
        <AddTaskForm
          key={composer.id}
          isModal={true}
          defaultProjectId={composer.defaultProjectId}
          initialValues={composer.draft}
          parentTaskId={composer.parentTaskId}
          parentTaskTitle={composer.parentTaskTitle}
          parentProjectName={composer.parentProjectName}
          parentProjectId={composer.parentProjectId}
          onSuccess={handleSuccess}
          onCreateAndAddAnother={handleCreateAndAddAnother}
          variant="composer"
          onFormChange={handleFormChange}
        />
      </div>
      <AlertDialog open={isPendingClose} onOpenChange={(open) => !open && cancelPendingClose(composer.id)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => cancelPendingClose(composer.id)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDiscard(composer.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (isSheet) {
    return (
      <div ref={cardRef} role="region" aria-label="New task composer" className="flex flex-col h-full min-h-0">
        {formAndDialog}
      </div>
    );
  }

  const content = (
    <div
      ref={cardRef}
      role="region"
      aria-label="New task composer"
      className={cn(
        "relative flex flex-col bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden",
        "w-full",
        minimized && "max-h-none"
      )}
      style={
        minimized
          ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }
          : {
              transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
              width: cardSize.width,
              height: cardSize.height,
              minWidth,
              minHeight,
            }
      }
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0"
      >
        <div data-drag-handle="true" onMouseDown={handleDragStart} className="flex items-center gap-2 min-w-0 cursor-move">
          <span className="text-sm font-medium truncate">
            {minimized ? getDisplayTitle(composer.draft) : "New task"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => (minimized ? expandComposer(composer.id) : minimizeComposer(composer.id))}
            className="p-1.5 rounded hover:bg-gray-200"
            aria-label={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? (
              <Maximize2 className="w-4 h-4 text-gray-600" />
            ) : (
              <Minimize2 className="w-4 h-4 text-gray-600" />
            )}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-gray-200"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div data-resize-handle="true" onMouseDown={(e) => startResize("n", e)} className="absolute top-0 left-3 right-3 h-3 cursor-n-resize z-30" />
          <div data-resize-handle="true" onMouseDown={(e) => startResize("s", e)} className="absolute bottom-0 left-3 right-3 h-3 cursor-s-resize z-30" />
          <div data-resize-handle="true" onMouseDown={(e) => startResize("e", e)} className="absolute right-0 top-3 bottom-3 w-3 cursor-e-resize z-30" />
          <div data-resize-handle="true" onMouseDown={(e) => startResize("w", e)} className="absolute left-0 top-3 bottom-3 w-3 cursor-w-resize z-30" />
          <div data-resize-handle="true" onMouseDown={(e) => startResize("ne", e)} className="absolute top-0 right-0 w-5 h-5 cursor-ne-resize z-30" />
          <div data-resize-handle="true" onMouseDown={(e) => startResize("nw", e)} className="absolute top-0 left-0 w-5 h-5 cursor-nw-resize z-30" />
          <div data-resize-handle="true" onMouseDown={(e) => startResize("se", e)} className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-30" />
          <div data-resize-handle="true" onMouseDown={(e) => startResize("sw", e)} className="absolute bottom-0 left-0 w-5 h-5 cursor-sw-resize z-30" />
        </>
      )}

      {/* Body - minimized: slim bar; expanded: form */}
      {minimized ? (
        <button
          type="button"
          onClick={() => expandComposer(composer.id)}
          className="w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 border-b"
        >
          {composer.draft.project_id_int && (
            <span className="text-gray-500">Project selected</span>
          )}
          {!composer.draft.project_id_int && (
            <span className="text-gray-400">Click to expand and add task</span>
          )}
        </button>
      ) : (
        formAndDialog
      )}
    </div>
  );

  return content;
}
