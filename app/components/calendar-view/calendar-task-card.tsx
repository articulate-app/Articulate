import React from 'react';
import type { Task } from '../../lib/types/tasks';
import { useMobileDetection } from '../../hooks/use-mobile-detection';

interface TaskCardProps {
  task: Task;
  colorClass: string;
  onClick?: () => void;
  isSelected?: boolean;
  style?: React.CSSProperties;
}

export function CalendarTaskCard({ task, colorClass, onClick, isSelected, style }: TaskCardProps) {
  const isMobile = useMobileDetection();

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

  if (isMobile) {
    // Mobile: Just a colored line
    return (
      <button
        className={`w-full h-1 rounded-sm transition ${isSelected ? 'ring-1 ring-blue-400' : ''}`}
        title={task.title}
        style={{ 
          maxWidth: '100%', 
          background: getBackgroundColor(),
          ...style 
        }}
        onClick={e => {
          e.stopPropagation();
          onClick?.();
        }}
      />
    );
  }

  // Desktop: Full card with title
  return (
    <button
      className={`w-full flex items-center gap-2 rounded shadow-sm ${colorClass} px-2 py-1 mb-1 text-xs font-medium truncate transition ${isSelected ? 'ring-2 ring-blue-400 border border-blue-400' : 'border border-transparent'} `}
      title={task.title}
      style={{ maxWidth: '100%', ...style }}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <span className="truncate block" style={{ maxWidth: '100%' }}>{task.title}</span>
    </button>
  );
} 