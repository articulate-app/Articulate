"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useTaskComposerStore } from "../../store/task-composer-store";
import { TaskComposerCard } from "./TaskComposerCard";
import { useMobileDetection } from "../../hooks/use-mobile-detection";

const MAX_VISIBLE = 3;

interface TaskComposerTrayProps {
  onTaskCreated?: (task: any) => void;
}

export function TaskComposerTray({ onTaskCreated }: TaskComposerTrayProps) {
  const [mounted, setMounted] = React.useState(false);
  const isMobile = useMobileDetection();
  const composers = useTaskComposerStore((s) => s.composers);
  const visibleComposers = React.useMemo(() => composers.slice(-MAX_VISIBLE), [composers]);
  const overflowCount = React.useMemo(
    () => Math.max(0, composers.length - MAX_VISIBLE),
    [composers.length]
  );

  React.useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  // On mobile, composer is shown in MobileTaskComposerSheet (bottom sheet) instead.
  if (isMobile) return null;

  const content = (
    <div
      className="fixed bottom-0 right-4 pb-4 z-[100] flex flex-col items-end gap-3"
      style={{ pointerEvents: "auto" }}
    >
      {/* Stack: oldest at bottom, newest at top. We render in order so the last one appears on top. */}
      {visibleComposers.map((composer) => (
        <TaskComposerCard
          key={composer.id}
          composer={composer}
          onTaskCreated={onTaskCreated}
        />
      ))}
      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <div className="px-3 py-1.5 rounded-md bg-gray-100 text-sm text-gray-600 border border-gray-200">
          +{overflowCount} draft{overflowCount > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
