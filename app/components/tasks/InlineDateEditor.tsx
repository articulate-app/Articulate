"use client"

import * as React from 'react'
import { Calendar } from '../ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover'
import { formatDateDisplay, fromISOToDisplay, toISODate } from '../../lib/utils'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InlineDateEditorProps {
  value: string // ISO yyyy-mm-dd or empty
  onChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onSave: () => void
  className?: string
  autoFocus?: boolean
  /** Open calendar popover on mount (e.g. when entering edit via hover) */
  openCalendarOnMount?: boolean
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
}: InlineDateEditorProps) {
  const [open, setOpen] = React.useState(false)
  const [textValue, setTextValue] = React.useState(() =>
    value ? fromISOToDisplay(value) : ''
  )
  const hasOpenedRef = React.useRef(false)

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

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setTextValue(v)
    const iso = toISODate(v)
    if (iso) onChange(iso)
  }

  const handleSelect = (d: Date | undefined) => {
    if (!d) return
    const iso = d.toISOString().split('T')[0]
    onChange(iso)
    setTextValue(formatDateDisplay(d))
    setOpen(false)
    onSave()
  }

  const handleBlur = () => {
    // Commit any valid partial input to ISO
    const iso = toISODate(textValue)
    if (iso) onChange(iso)
    setTextValue(iso ? fromISOToDisplay(iso) : '')
    onBlur()
  }

  const selectedDate = value ? new Date(value + 'T12:00:00') : undefined
  const isValidDate = selectedDate && !isNaN(selectedDate.getTime())

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
                onSave()
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
