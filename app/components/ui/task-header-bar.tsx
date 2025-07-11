"use client"

import React from 'react';
import { Button } from './button';
import { Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu";
import { ShareButton } from './share-button';

interface TaskHeaderBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onFilterClick: () => void;
  onSidebarToggle?: () => void;
  placeholder?: string;
}

export function TaskHeaderBar({
  searchValue,
  onSearchChange,
  onFilterClick,
  onSidebarToggle,
  placeholder,
}: TaskHeaderBarProps) {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClientComponentClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });
  }, []);

  // Sign out handler
  const handleSignOut = async () => {
    const supabase = createClientComponentClient();
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  // Helper to get user initials
  function getUserInitials(user: any) {
    if (!user) return 'U';
    const fullName = user.user_metadata?.full_name || user.name;
    if (fullName) {
      const parts = fullName.trim().split(' ');
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (user.email) return user.email[0].toUpperCase();
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
      {/* User avatar at top right */}
      <div className="ml-4 flex items-center user-avatar-dropdown relative">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold text-base select-none border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="User menu"
              >
                {getUserInitials(user)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 w-40">
              <DropdownMenuItem asChild>
                <a href="/settings" className="cursor-pointer">Settings</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer"
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-2.5 3.5-4 8-4s8 1.5 8 4" />
            </svg>
          </div>
        )}
      </div>
    </header>
  );
} 