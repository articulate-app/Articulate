"use client"

import React from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MultiselectToggleProps {
  isMultiselectMode: boolean
  onToggle: () => void
  className?: string
}

export function MultiselectToggle({ 
  isMultiselectMode, 
  onToggle, 
  className = "" 
}: MultiselectToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        className,
        isMultiselectMode && 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
      )}
    >
      {isMultiselectMode ? (
        <>
          <CheckSquare className="w-4 h-4 inline-block mr-1" />
          <span>Select</span>
        </>
      ) : (
        <>
          <Square className="w-4 h-4 inline-block mr-1" />
          <span>Select</span>
        </>
      )}
    </button>
  )
} 