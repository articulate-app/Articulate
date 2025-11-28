"use client"

import React from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type TriState = true | false | null

interface TriStateCheckboxProps {
  value: TriState
  onChange: (value: TriState) => void
  disabled?: boolean
  className?: string
  label?: string
}

/**
 * Tri-state checkbox that cycles: null (inherit) -> true -> false -> null
 * null = inherit from parent (indeterminate)
 * true = override enabled
 * false = override disabled
 */
export function TriStateCheckbox({
  value,
  onChange,
  disabled = false,
  className,
  label,
}: TriStateCheckboxProps) {
  const handleClick = () => {
    if (disabled) return
    
    // Cycle: null -> true -> false -> null
    if (value === null) {
      onChange(true)
    } else if (value === true) {
      onChange(false)
    } else {
      onChange(null)
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'relative h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors',
          value === true && 'bg-primary text-primary-foreground',
          value === null && 'bg-primary/50 border-primary',
          value === false && 'bg-background'
        )}
        aria-checked={value === true ? 'true' : value === false ? 'false' : 'mixed'}
      >
        {value === true && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Check className="h-3 w-3" />
          </div>
        )}
        {value === null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Minus className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
      </button>
      {label && (
        <label
          onClick={handleClick}
          className={cn(
            'text-sm cursor-pointer',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {label}
        </label>
      )}
    </div>
  )
}

