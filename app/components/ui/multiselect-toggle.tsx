"use client"

import React from 'react'
import { cn } from '@/lib/utils'

interface MultiselectToggleProps {
  isMultiselectMode: boolean
  onToggle: () => void
  className?: string
}

export function MultiselectToggle({
  isMultiselectMode,
  onToggle,
  className = "",
}: MultiselectToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        className,
        isMultiselectMode && 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
      )}
    >
      Multiselect
    </button>
  )
}
