"use client"

import React from 'react';
import { Search } from 'lucide-react';
import { Button } from './button';

interface TasksHeaderIconProps {
  onClick: () => void;
  isActive?: boolean;
  className?: string;
}

export function TasksHeaderIcon({ onClick, isActive = false, className = "" }: TasksHeaderIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center p-2 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors ${className}`}
      aria-label="Open Keyword Planner"
      title="Keyword Planner"
    >
      <Search className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
    </button>
  );
} 