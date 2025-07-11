import React from 'react';
import type { Task } from '../../lib/types/tasks';

interface TaskCardProps {
  task: Task;
  colorClass: string;
  onClick?: () => void;
}

export function CalendarTaskCard({ task, colorClass, onClick }: TaskCardProps) {
  return (
    <button
      className={`w-full flex items-center gap-2 rounded shadow-sm border-l-4 ${colorClass} bg-white px-2 py-1 mb-1 text-xs font-medium truncate hover:bg-gray-50 transition text-gray-900`}
      title={task.title}
      style={{ maxWidth: '100%' }}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <span className="truncate block" style={{ maxWidth: '100%' }}>{task.title}</span>
    </button>
  );
} 