"use client"

import * as React from 'react'
import { Calendar } from '../ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover'
import { formatDateDisplay, formatCompactDateDisplay, fromISOToDisplay, toISODate } from '../../lib/utils'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COMPACT_DATE_TRIGGER_ACTIVE_CLASS, COMPACT_DATE_TRIGGER_CLASS } from './compact-task-row'

interface InlineDateEditorProps {
  value: string // ISO yyyy-mm-dd or empty
  onChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onSave: (value: string) => void
  className?: string
  autoFocus?: boolean
  /** Open calendar popover on mount (e.g. when entering edit via hover) */
  openCalendarOnMount?: boolean
  /**
   * Compact list rows: show the short dd/mmm trigger (no inline text input) and edit via calendar
   * popover only. Keeps row width/typography stable while editing.
   */
  compact?: boolean
  /** Hover/active affordance for compact trigger (matches display cell hover styling). */
  isActive?: boolean
}

export function InlineDateEditor({
  value,
  onChange,
  onBlur,
  onKeyDown,
  onSave,
  className,
  autoFocus,
  openCalendarOnMount = true,
  compact = false,
  isActive = false,
}: InlineDateEditorProps) {
  const [open, setOpen] = React.useState(false)
  const [textValue, setTextValue] = React.useState(() =>
    value ? fromISOToDisplay(value) : ''
  )
  const hasOpenedRef = React.useRef(false)
  const savedViaSelectRef = React.useRef(false)

  // Sync text when value prop changes (e.g. from parent)
  React.useEffect(() => {
    setTextValue(value ? fromISOToDisplay(value) : '')
  }, [value])

  // Open calendar when entering edit mode
  React.useEffect(() => {
    if (openCalendarOnMount && !hasOpenedRef.current) {
      hasOpenedRef.current = true
      setOpen(true)
    }
  }, [openCalendarOnMount])

  const selectedDate = value ? new Date(value + 'T12:00:00') : undefined
  const isValidDate = selectedDate && !isNaN(selectedDate.getTime())

  const handleSelect = (d: Date | undefined) => {
    if (!d) return
    const iso = d.toISOString().split('T')[0]
    onChange(iso)
    if (!compact) setTextValue(formatDateDisplay(d))
    savedViaSelectRef.current = true
    setOpen(false)
    onSave(iso)
  }

  const handlePopoverOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      if (savedViaSelectRef.current) {
        savedViaSelectRef.current = false
        return
      }
      onBlur()
    }
  }

  if (compact) {
    const displayText = value ? formatCompactDateDisplay(value) : ''

    return (
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-editable-cell
            data-inline-editor
            aria-label={displayText ? `Edit date, ${displayText}` : 'Edit date'}
            className={cn(
              COMPACT_DATE_TRIGGER_CLASS,
              isActive && COMPACT_DATE_TRIGGER_ACTIVE_CLASS,
              'w-full text-right',
              className,
            )}
            autoFocus={autoFocus}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
                onKeyDown(e)
              } else {
                onKeyDown(e)
              }
            }}
          >
            {displayText || '\u00A0'}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[60] w-auto p-0"
          side="top"
          align="end"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseDownCapture={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          <Calendar
            mode="single"
            selected={isValidDate ? selectedDate! : undefined}
            onSelect={handleSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    )
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setTextValue(v)
    const iso = toISODate(v)
    if (iso) onChange(iso)
  }

  const handleBlur = () => {
    // Commit any valid partial input to ISO
    const iso = toISODate(textValue)
    if (iso) onChange(iso)
    setTextValue(iso ? fromISOToDisplay(iso) : '')
    onBlur()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative flex items-center w-full">
          <input
            type="text"
            value={textValue}
            onChange={handleTextChange}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const iso = toISODate(textValue)
                if (iso) onChange(iso)
                onSave(iso || value)
              } else if (e.key === 'Escape') {
                setOpen(false)
                onKeyDown(e)
              } else {
                onKeyDown(e)
              }
            }}
            placeholder="dd/mm/yyyy"
            className={cn(
              'w-full px-1 py-0.5 pr-8 bg-white border border-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-gray-500',
              className
            )}
            autoFocus={autoFocus}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-gray-700"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((o) => !o)
            }}
            tabIndex={-1}
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={isValidDate ? selectedDate! : undefined}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
