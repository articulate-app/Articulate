"use client"

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface InlineSearchInputProps {
  isOpen: boolean
  value: string
  onChange: (value: string) => void
  onClose: () => void
  className?: string
}

export function InlineSearchInput({ isOpen, value, onChange, onClose, className }: InlineSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])
  
  if (!isOpen) return null
  
  return (
    <div className={cn("ml-2 flex-shrink-0", className)}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search tasks..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose()
          }
        }}
        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
      />
    </div>
  )
}


