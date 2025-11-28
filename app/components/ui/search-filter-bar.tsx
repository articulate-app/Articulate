"use client"

import React from 'react'
import { Filter } from 'lucide-react'

interface SearchFilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  onFilterClick: () => void
  activeFilterCount?: number
  searchPlaceholder?: string
  className?: string
}

export function SearchFilterBar({
  searchValue,
  onSearchChange,
  onFilterClick,
  activeFilterCount = 0,
  searchPlaceholder = "Search...",
  className = ""
}: SearchFilterBarProps) {
  return (
    <div className={`w-full sticky top-0 z-30 bg-white border-b flex items-center h-16 px-4 gap-4 shadow-sm ${className}`}>
      {/* Centered search bar */}
      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-xl">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-4 pr-12 py-2 border rounded-md w-full focus:outline-none focus:ring-2 focus:ring-gray-200 text-base"
          />
          <button
            type="button"
            aria-label="Filter"
            onClick={onFilterClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
            tabIndex={0}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
} 