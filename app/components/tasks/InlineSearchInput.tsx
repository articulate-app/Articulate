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
  className?: string
}

export function InlineSearchInput({
  isOpen,
  value,
  onChange,
  onClose,
  placeholder = "Search...",
  trailing,
  className,
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
        "relative flex min-w-0 flex-1 items-center rounded-md border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-1",
        className,
      )}
    >
      <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400" aria-hidden />
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
          "min-w-0 flex-1 bg-transparent py-1.5 pl-8 text-sm focus:outline-none",
          trailing ? "pr-20" : "pr-9",
        )}
        aria-label={placeholder}
      />
      <div className="absolute right-1 flex shrink-0 items-center">
        {trailing}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close search"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
