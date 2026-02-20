"use client"

import * as React from 'react'
import { Popover, PopoverContent, PopoverAnchor } from '../ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem } from '../ui/command'
import { UserAvatar } from '@/components/UserAvatar'
import { getImageUrl } from '../../lib/public-media'
import { cn } from '@/lib/utils'

export interface InlineSelectOption {
  value: string | number
  label: string
  photo?: string | null
  logo?: string | null
  logo_url?: string | null
  logoUrl?: string | null
  color?: string | null
}

interface InlineSelectProps {
  options: InlineSelectOption[]
  value: string | number
  onChange: (value: string | number) => void
  onBlur: () => void
  placeholder?: string
  emptyOption?: { value: string; label: string }
  showMedia?: 'avatar' | 'logo' | 'color' | 'none'
  className?: string
  autoFocus?: boolean
  /** Temporary dev log label (e.g. "project") for debugging */
  debugLabel?: string
}

function InlineSelectInner({
  options,
  value,
  onChange,
  onBlur,
  placeholder = 'Select...',
  emptyOption,
  showMedia = 'none',
  className,
  autoFocus,
  debugLabel,
}: InlineSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const allOptions = React.useMemo(() => {
    const list = emptyOption ? [{ value: emptyOption.value, label: emptyOption.label } as InlineSelectOption, ...options] : options
    return list
  }, [emptyOption, options])

  const optionsByKey = React.useMemo(
    () => new Map(allOptions.map(o => [String(o.value), o])),
    [allOptions]
  )

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return allOptions
    const q = search.toLowerCase()
    return allOptions.filter(o => o.label.toLowerCase().includes(q))
  }, [allOptions, search])

  const valueKey = value == null ? '' : String(value)
  const selected = optionsByKey.get(valueKey) ?? null

  const closeAndExit = React.useCallback(() => {
    setOpen(false)
    setSearch('')
    onBlur()
  }, [onBlur])

  const handleSelect = React.useCallback((key: string) => {
    const option = optionsByKey.get(key)
    if (option !== undefined) {
      if (debugLabel === 'project') {
        console.log('[InlineSelect] select', { key, option })
      }
      onChange(option.value)
    }
    setOpen(false)
    setSearch('')
    onBlur()
  }, [onChange, onBlur, optionsByKey, debugLabel])

  const handleOpenChange = React.useCallback((o: boolean) => {
    setOpen(o)
    if (!o) {
      setSearch('')
      onBlur()
    }
  }, [onBlur])

  const handleInteractOutside = React.useCallback((e: { preventDefault: () => void; detail?: { originalEvent?: { target?: EventTarget | null } }; target?: EventTarget | null }) => {
    e.preventDefault()
    const target = (e.detail?.originalEvent?.target ?? e.target ?? null) as Element | null
    if (target?.closest?.('[data-active-editor]')) return
    closeAndExit()
  }, [closeAndExit])

  const handlePointerDownOutside = React.useCallback((e: { preventDefault: () => void; detail?: { originalEvent?: { target?: EventTarget | null } }; target?: EventTarget | null }) => {
    e.preventDefault()
    const target = (e.detail?.originalEvent?.target ?? e.target ?? null) as Element | null
    if (target?.closest?.('[data-active-editor]')) return
    closeAndExit()
  }, [closeAndExit])

  const handleEscapeKeyDown = React.useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    closeAndExit()
  }, [closeAndExit])

  React.useEffect(() => {
    if (autoFocus) {
      setOpen(true)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [autoFocus])

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  const getLogoUrl = (opt: InlineSelectOption) => {
    const logo = opt.logo ?? opt.logo_url ?? opt.logoUrl ?? null
    return logo ? getImageUrl(logo) : null
  }

  const renderOptionMedia = (opt: InlineSelectOption) => {
    if (showMedia === 'avatar' && (opt.photo || opt.label)) {
      return (
        <UserAvatar
          name={opt.label}
          photoUrl={opt.photo ? getImageUrl(opt.photo) : null}
          size="sm"
        />
      )
    }
    if (showMedia === 'logo') {
      const logoUrl = getLogoUrl(opt)
      return logoUrl ? (
        <img src={logoUrl} alt="" className="h-4 w-4 rounded-sm object-cover flex-shrink-0" />
      ) : (
        <span
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: opt.color || '#e5e7eb' }}
        />
      )
    }
    if (showMedia === 'color' && opt.color) {
      return (
        <span
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: opt.color }}
        />
      )
    }
    return null
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div data-inline-editor className="w-full">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              closeAndExit()
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={selected ? selected.label : placeholder}
          className={cn(
            'w-full h-8 px-1.5 py-0.5 bg-white border border-gray-500 rounded text-sm placeholder:text-gray-500',
            'focus:outline-none focus:ring-1 focus:ring-gray-500',
            className
          )}
        />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-[var(--inline-select-width,200px)] p-0 z-[60] pointer-events-auto"
        style={{ zIndex: 60, pointerEvents: 'auto' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => { e.preventDefault() }}
        onInteractOutside={handleInteractOutside}
        onPointerDownOutside={handlePointerDownOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
        onMouseDownCapture={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <div data-inline-select data-inline-editor>
          <Command
            shouldFilter={false}
            className="[&_[cmdk-input-wrapper]]:hidden"
            style={{ pointerEvents: 'auto' }}
          >
            <CommandEmpty className="py-2 text-sm text-gray-600 px-2">No options found.</CommandEmpty>
            <CommandGroup
              className="max-h-[280px] overflow-y-auto overscroll-contain p-1"
              style={{
                maxHeight: 280,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                pointerEvents: 'auto',
              }}
              onWheel={(e) => e.stopPropagation()}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              {filteredOptions.map((opt) => {
                const key = String(opt.value)
                return (
                <CommandItem
                  key={key}
                  value={key}
                  onSelect={() => handleSelect(key)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer"
                >
                  {renderOptionMedia(opt)}
                  <span>{opt.label}</span>
                </CommandItem>
              )})}
            </CommandGroup>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export const InlineSelect = React.memo(InlineSelectInner)
