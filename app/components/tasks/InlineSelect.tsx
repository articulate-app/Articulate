"use client"

import * as React from 'react'
import { Popover, PopoverContent, PopoverAnchor, PopoverTrigger } from '../ui/popover'
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
  /**
   * Compact list rows: avatar-only trigger; options open in a popover above the row.
   * Keeps row width/height stable while editing.
   */
  variant?: 'default' | 'compact'
  /** Compact variant: assignee display for the avatar trigger */
  assigneeDisplayName?: string
  assigneePhotoUrl?: string | null
  triggerClassName?: string
  triggerAriaLabel?: string
  onTriggerPointerEnter?: () => void
  onTriggerPointerLeave?: () => void
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
  variant = 'default',
  assigneeDisplayName = '',
  assigneePhotoUrl = null,
  triggerClassName,
  triggerAriaLabel,
  onTriggerPointerEnter,
  onTriggerPointerLeave,
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

  const renderDropdown = () => (
    <div data-inline-select data-inline-editor>
      <Command
        shouldFilter={false}
        className={variant === 'compact' ? undefined : '[&_[cmdk-input-wrapper]]:hidden'}
        style={{ pointerEvents: 'auto' }}
      >
        {variant === 'compact' ? (
          <div className="border-b px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeAndExit()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
            />
          </div>
        ) : null}
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
            )
          })}
        </CommandGroup>
      </Command>
    </div>
  )

  const popoverContentProps = {
    align: (variant === 'compact' ? 'end' : 'start') as 'end' | 'start',
    ...(variant === 'compact' ? { side: 'top' as const } : {}),
    sideOffset: 2,
    className: 'w-[var(--inline-select-width,200px)] p-0 z-[60] pointer-events-auto',
    style: { zIndex: 60, pointerEvents: 'auto' as const },
    onOpenAutoFocus: (e: Event) => e.preventDefault(),
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault()
    },
    onInteractOutside: handleInteractOutside,
    onPointerDownOutside: handlePointerDownOutside,
    onEscapeKeyDown: handleEscapeKeyDown,
    onMouseDownCapture: (e: React.MouseEvent) => e.stopPropagation(),
    onPointerDownCapture: (e: React.PointerEvent) => e.stopPropagation(),
  }

  if (variant === 'compact') {
    const hasAssignee = valueKey !== ''

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-editable-cell
            data-inline-editor
            aria-label={triggerAriaLabel ?? (assigneeDisplayName ? `Edit assignee, ${assigneeDisplayName}` : 'Assign user')}
            title={assigneeDisplayName || undefined}
            className={cn(
              'shrink-0 inline-flex items-center justify-center rounded-full border border-transparent transition-colors hover:border-gray-300',
              triggerClassName,
            )}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={onTriggerPointerEnter}
            onPointerLeave={onTriggerPointerLeave}
          >
            {hasAssignee ? (
              <UserAvatar
                name={assigneeDisplayName}
                photoUrl={assigneePhotoUrl}
                size="xs"
                className="!h-5 !w-5 !min-h-5 !min-w-5"
              />
            ) : (
              <span className="block h-5 w-5 rounded-full border border-dashed border-gray-300" aria-hidden />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent {...popoverContentProps}>
          {renderDropdown()}
        </PopoverContent>
      </Popover>
    )
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
        {...popoverContentProps}
      >
        {renderDropdown()}
      </PopoverContent>
    </Popover>
  )
}

export const InlineSelect = React.memo(InlineSelectInner)
