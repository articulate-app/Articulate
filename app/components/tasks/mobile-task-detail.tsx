"use client";

import React, { useEffect, useState } from 'react';
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
}: MobileTaskDetailProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (!task) {
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
      "flex flex-col h-full bg-white absolute inset-0 z-50",
      "md:hidden", // Only show on mobile
      className
    )}>
      {/* Mobile Header with Back Button */}
      <div className="flex items-center px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="ml-3 text-lg font-semibold text-gray-900 truncate flex-1">
          {task.title}
        </h1>
      </div>

      {/* Task Details Content */}
      <div className="flex-1 overflow-y-auto">
        <TaskDetails
          isCollapsed={false}
          selectedTask={adaptTaskForTaskDetails(task)}
          onClose={onBack}
          onCollapse={onBack}
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
        />
      </div>
    </div>
  );
} 