import React from 'react';
import { Zap } from 'lucide-react';
import type { Task } from '../../lib/types/tasks';

interface TaskCardProps {
  task: Task & { kind?: 'task' | 'suggestion' };
  colorClass: string;
  onClick?: () => void;
  isSelected?: boolean;
  isBulkSelected?: boolean;
  style?: React.CSSProperties;
}

export function CalendarTaskCard({ task, colorClass, onClick, isSelected, isBulkSelected, style }: TaskCardProps) {
  const isSuggestion = task?.kind === 'suggestion'

  // Extract background color from colorClass or style
  const getBackgroundColor = () => {
    if (style?.background) return style.background;
    
    // Map Tailwind color classes to hex values
    const colorMap: Record<string, string> = {
      'bg-blue-200': '#bfdbfe',
      'bg-green-200': '#bbf7d0',
      'bg-pink-200': '#fbcfe8',
      'bg-yellow-200': '#fef3c7',
      'bg-purple-200': '#ddd6fe',
      'bg-orange-200': '#fed7aa',
      'bg-teal-200': '#99f6e4',
      'bg-red-200': '#fecaca',
      'bg-cyan-200': '#a5f3fc',
      'bg-lime-200': '#d9f99d',
      'bg-fuchsia-200': '#f5d0fe',
      'bg-amber-200': '#fde68a',
      'bg-gray-100': '#f3f4f6',
    };
    
    // Extract the color class from the full className
    const colorClassMatch = colorClass.match(/bg-\w+-\d+/);
    if (colorClassMatch) {
      return colorMap[colorClassMatch[0]] || '#3b82f6'; // Default to blue
    }
    
    return '#3b82f6'; // Default fallback
  };

  // Always render full cards to avoid line-only placeholder flicker.
  return (
    <button
      className={`w-full min-h-[26px] flex items-center gap-2 rounded shadow-sm ${colorClass} px-2 py-1 mb-1 text-xs font-medium truncate ${
        isBulkSelected
          ? 'ring-2 ring-gray-700 border border-gray-700'
          : isSelected
            ? 'ring-2 ring-blue-400 border border-blue-400'
            : isSuggestion
              ? 'border border-dashed border-gray-300'
              : 'border border-transparent'
      } `}
      title={task.title}
      style={{ maxWidth: '100%', ...style }}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <span className="truncate block" style={{ maxWidth: '100%' }}>{task.title}</span>
      {isSuggestion ? (
        <span
          className="shrink-0 inline-flex items-center text-gray-500"
          title="AI suggestion"
          aria-label="AI suggestion"
        >
          <Zap className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
} 