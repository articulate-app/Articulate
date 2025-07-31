"use client";

import React from 'react';
import { cn } from '@/lib/utils';

export type MobileViewMode = 'list' | 'kanban' | 'calendar';

interface MobileNavigationProps {
  currentView: MobileViewMode;
  onViewChange: (view: MobileViewMode) => void;
  className?: string;
}

export function MobileNavigation({ 
  currentView, 
  onViewChange, 
  className 
}: MobileNavigationProps) {
  // Reuse the pill button style from TasksLayout
    const pillButton =
    "px-2 py-1 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 transition-all duration-200";

  const views: { key: MobileViewMode; label: string }[] = [
    { key: 'list', label: 'Task List' },
    { key: 'kanban', label: 'Kanban' },
    { key: 'calendar', label: 'Calendar' }
  ];

  return (
    <div className={cn(
      "flex justify-center gap-1 px-4 py-2 bg-white border-b border-gray-200",
      "md:hidden", // Only show on mobile
      className
    )}>
      {views.map((view) => (
        <button
          key={view.key}
          onClick={() => onViewChange(view.key)}
                               className={cn(
                       pillButton,
                       currentView === view.key && "bg-blue-500 text-white border-blue-500 hover:bg-blue-600"
                     )}
          type="button"
        >
          {view.label}
        </button>
      ))}
    </div>
  );
} 