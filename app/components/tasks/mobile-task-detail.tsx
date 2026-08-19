"use client";

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskDetails } from './TaskDetails';
import type { Task } from '../../lib/types/tasks';

interface MobileTaskDetailProps {
  task: Task | null;
  onBack: () => void;
  className?: string;
  onTaskUpdate?: (updatedFields: Partial<Task>) => void;
  onAddSubtask?: (parentTaskId: number, projectId: number) => void;
  /** "suggestion" renders the task-suggestion detail; the suggestion object is already adapted. */
  mode?: "task" | "suggestion";
}

// Helper function to convert Task type to TaskDetails expected type
function adaptTaskForTaskDetails(task: Task): any {
  return {
    ...task,
    id: String(task.id),
    assigned_to_id: task.assigned_to_id || '',
    project_id_int: task.project_id_int || null,
    content_type_id: task.content_type_id || '',
    production_type_id: task.production_type_id || '',
    language_id: task.language_id || '',
    project_status_id: task.project_status_id || '',
    assigned_to_name: task.users?.full_name || null,
    project_color: task.projects?.color || null,
    content_type_title: task.content_types?.[0]?.title || null,
    production_type_title: task.production_types?.[0]?.title || null,
    language_code: task.languages?.[0]?.code || null,
    channel_names: [],
    threads: [],
    mentions: [],
    thread_watchers: [],
  };
}

export function MobileTaskDetail({
  task,
  onBack,
  className,
  onTaskUpdate,
  onAddSubtask,
  mode = "task",
}: MobileTaskDetailProps) {
  const isSuggestionMode = mode === "suggestion";

  // In suggestion mode the suggestion object is already adapted for TaskDetails (and may briefly be
  // null while loading). Render the detail shell rather than the "No task selected" empty state so a
  // direct suggestion URL opens the detail UI immediately and TaskDetails owns the loading state.
  if (!task && !isSuggestionMode) {
    return (
      <div className={cn(
        "flex flex-col h-full bg-white",
        "md:hidden", // Only show on mobile
        className
      )}>
        <div className="flex items-center px-4 py-3 border-b border-gray-200">
          <button
            onClick={onBack}
            className="flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="ml-3 text-lg font-semibold text-gray-900">Task Details</h1>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <p>No task selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex h-full min-h-0 flex-col bg-white",
      className
    )}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TaskDetails
          isCollapsed={false}
          selectedTask={isSuggestionMode ? (task as any) : (task ? adaptTaskForTaskDetails(task) : null)}
          onClose={onBack}
          onCollapse={onBack}
          onMobileBack={onBack}
          isExpanded={true}
          onExpand={() => {}}
          onRestore={() => {}}
          onTaskUpdate={onTaskUpdate}
          onAddSubtask={onAddSubtask}
          attachments={[]}
          threadId={null}
          mentions={[]}
          watchers={[]}
          currentUser={null}
          subtasks={[]}
          project_watchers={[]}
          accessToken={null}
          mode={mode}
        />
      </div>
    </div>
  );
} 