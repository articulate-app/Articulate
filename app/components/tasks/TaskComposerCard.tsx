"use client";

import * as React from "react";
import { X, Minimize2, Maximize2 } from "lucide-react";
import { AddTaskForm } from "./AddTaskForm";
import {
  useTaskComposerStore,
  type TaskComposer,
  type TaskComposerDraft,
} from "../../store/task-composer-store";
import { useTasksUI } from "../../store/tasks-ui";
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

function getDisplayTitle(draft: TaskComposerDraft): string {
  const title = (draft.title || "").trim();
  if (title) return title.length > 40 ? title.slice(0, 40) + "…" : title;
  return "New task";
}

export function TaskComposerCard({ composer, onTaskCreated, variant = "card" }: TaskComposerCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragStateRef = React.useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const lastSyncedRef = React.useRef<{ title?: string; project_id_int?: string; project_status_id?: string; briefing?: string; dirty?: boolean } | null>(null);
  const updateDraft = useTaskComposerStore((s) => s.updateDraft);
  const setDirty = useTaskComposerStore((s) => s.setDirty);
  const minimizeComposer = useTaskComposerStore((s) => s.minimizeComposer);
  const expandComposer = useTaskComposerStore((s) => s.expandComposer);
  const requestCloseComposer = useTaskComposerStore((s) => s.requestCloseComposer);
  const confirmDiscard = useTaskComposerStore((s) => s.confirmDiscard);
  const cancelPendingClose = useTaskComposerStore((s) => s.cancelPendingClose);
  const setSelectedTaskId = useTasksUI((s) => s.setSelectedTaskId);
  const pendingCloseId = useTaskComposerStore((s) => s.pendingCloseId);
  const isPendingClose = pendingCloseId === composer.id;
  const isSheet = variant === "sheet";

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
      setSelectedTaskId(task?.id ?? null);
      onTaskCreated?.(task);
      useTaskComposerStore.getState().forceCloseComposer(composer.id);
    },
    [composer.id, onTaskCreated, setSelectedTaskId]
  );

  const handleCreateAndAddAnother = React.useCallback(
    (task: any) => {
      setSelectedTaskId(task?.id ?? null);
      onTaskCreated?.(task);
      // Composer stays open; form resets inside AddTaskForm
    },
    [onTaskCreated, setSelectedTaskId]
  );

  const handleClose = React.useCallback(() => {
    requestCloseComposer(composer.id);
  }, [composer.id, requestCloseComposer]);

  // ESC to close
  React.useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestCloseComposer(composer.id);
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [composer.id, requestCloseComposer]);

  // Focus title on expand
  React.useEffect(() => {
    if (!composer.isMinimized && titleInputRef.current) {
      titleInputRef.current.focus?.();
    }
  }, [composer.isMinimized]);

  const handleDragStart = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
  }, [dragOffset.x, dragOffset.y]);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
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
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const minimized = composer.isMinimized;

  const formAndDialog = (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto">
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
        "flex flex-col bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden",
        "w-full max-w-[420px] sm:w-[420px] max-h-[68vh]",
        minimized && "max-h-none"
      )}
      style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 shrink-0 cursor-move"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 min-w-0">
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

      {/* Body - minimized: slim bar; expanded: form */}
      {minimized ? (
        <button
          type="button"
          onClick={() => expandComposer(composer.id)}
          className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 border-b"
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
