"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface InlineSearchInputProps {
  isOpen: boolean
  value: string
  onChange: (value: string) => void
  onClose: () => void
  placeholder?: string
  /** Optional control rendered before the clear/close actions (e.g. filter icon). */
  trailing?: ReactNode
  /** Optional control rendered after the search icon (e.g. object switcher). */
  leading?: ReactNode
  className?: string
  /** Stretch to fill the chrome row (object toggle lives inside). */
  fullWidth?: boolean
}

export function InlineSearchInput({
  isOpen,
  value,
  onChange,
  onClose,
  placeholder = "Search...",
  trailing,
  leading,
  className,
  fullWidth = false,
}: InlineSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center rounded-md border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-1",
        fullWidth ? "h-8 flex-1" : "flex-1",
        className,
      )}
    >
      <Search
        className={cn(
          "pointer-events-none absolute h-3.5 w-3.5 text-gray-400",
          leading ? "left-2 top-1/2 -translate-y-1/2" : "left-2",
        )}
        aria-hidden
      />
      {leading ? (
        <div className="ml-7 flex shrink-0 items-center border-r border-gray-200 pr-1">
          {leading}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose()
          }
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent py-1 text-xs font-normal focus:outline-none",
          leading ? "pl-2" : "pl-7",
          trailing ? "pr-16" : "pr-8",
        )}
        aria-label={placeholder}
      />
      <div className="absolute right-0.5 flex shrink-0 items-center">
        {trailing}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
