"use client"

import React from 'react';
import { Button } from './button';
import { Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUserStore } from '../../store/current-user';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu";
import { ShareButton } from './share-button';
import { TasksHeaderIcon } from './TasksHeaderIcon';

interface TaskHeaderBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onFilterClick: () => void;
  onSidebarToggle?: () => void;
  onKeywordPlannerClick?: () => void;
  isKeywordPlannerActive?: boolean;
  placeholder?: string;
}

export function TaskHeaderBar({
  searchValue,
  onSearchChange,
  onFilterClick,
  onSidebarToggle,
  onKeywordPlannerClick,
  isKeywordPlannerActive = false,
  placeholder,
}: TaskHeaderBarProps) {
  const router = useRouter();
  const publicUserId = useCurrentUserStore((s) => s.publicUserId);
  const fullName = useCurrentUserStore((s) => s.fullName);
  const userMetadata = useCurrentUserStore((s) => s.userMetadata);

  // Helper to get user initials
  function getUserInitials() {
    // First try to use full_name from the users table
    if (fullName) {
      const parts = fullName.trim().split(' ');
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // Fallback to user metadata
    if (userMetadata?.full_name) {
      const parts = userMetadata.full_name.trim().split(' ');
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // Fallback to email from metadata
    if (userMetadata?.email) {
      return userMetadata.email[0].toUpperCase();
    }
    
    return 'U';
  }

  return (
    <header className="w-full sticky top-0 z-30 bg-white border-b flex items-center h-16 px-4 gap-4 shadow-sm">
      {/* Hamburger icon */}
      <button
        type="button"
        className="flex items-center justify-center p-2 rounded hover:bg-gray-100 focus:outline-none"
        aria-label="Open sidebar"
        onClick={onSidebarToggle}
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      {/* App name */}
      <span className="text-2xl font-bold tracking-tight text-gray-900 select-none mr-4">Articulate</span>
      {/* Centered search bar */}
      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-xl">
          <input
            type="text"
            placeholder={placeholder || "Search tasks..."}
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-4 pr-12 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-gray-200 text-base"
          />
          <button
            type="button"
            aria-label="Filter tasks"
            onClick={onFilterClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
            tabIndex={0}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>
      {/* Share button next to user avatar */}
      <ShareButton url={typeof window !== 'undefined' ? window.location.href : ''} className="mr-2" />
      {/* Keyword Planner icon */}
      {onKeywordPlannerClick && (
        <TasksHeaderIcon
          onClick={onKeywordPlannerClick}
          isActive={isKeywordPlannerActive}
          className="mr-2"
        />
      )}
      {/* User avatar at top right with initials */}
      <div className="ml-4 flex items-center user-avatar-dropdown relative">
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 border border-gray-200 font-medium text-sm">
          {getUserInitials()}
        </div>
      </div>
    </header>
  );
} 