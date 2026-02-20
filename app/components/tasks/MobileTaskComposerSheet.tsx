"use client";

import * as React from "react";
import { useTaskComposerStore } from "../../store/task-composer-store";
import { TaskComposerCard } from "./TaskComposerCard";
import { SlidePanel } from "../ui/slide-panel";
import { useMobileDetection } from "../../hooks/use-mobile-detection";

interface MobileTaskComposerSheetProps {
  onTaskCreated?: (task: unknown) => void;
}

/**
 * On mobile only, renders the task composer inside a bottom sheet (same UX as FilterPane).
 * Close via backdrop tap or X triggers discard confirmation when the form is dirty.
 * Desktop continues to use TaskComposerTray.
 */
export function MobileTaskComposerSheet({ onTaskCreated }: MobileTaskComposerSheetProps) {
  const isMobile = useMobileDetection();
  const composers = useTaskComposerStore((s) => s.composers);
  const requestCloseComposer = useTaskComposerStore((s) => s.requestCloseComposer);

  const activeComposer = composers.length > 0 ? composers[composers.length - 1] : null;

  const handleClose = React.useCallback(() => {
    if (activeComposer) requestCloseComposer(activeComposer.id);
  }, [activeComposer, requestCloseComposer]);

  if (!isMobile || !activeComposer) return null;

  return (
    <SlidePanel
      isOpen={true}
      onClose={handleClose}
      position="bottom"
      title="New task"
      hasOverlay={true}
    >
      <div className="flex flex-col h-full min-h-0">
        <TaskComposerCard
          composer={activeComposer}
          onTaskCreated={onTaskCreated}
          variant="sheet"
        />
      </div>
    </SlidePanel>
  );
}
