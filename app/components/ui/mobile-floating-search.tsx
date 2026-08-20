"use client"

import { Search, X } from "lucide-react"

/**
 * Thumb-reach floating search for mobile lists. Filters the current object list
 * in place (same as desktop) — does not open global search.
 */
export function MobileFloatingSearch({
  placeholder,
  value,
  onChange,
  onClear,
}: {
  placeholder: string
  value?: string
  onChange: (value: string) => void
  onClear?: () => void
}) {
  const hasValue = Boolean(value?.trim())
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <label className="pointer-events-auto flex h-12 w-full items-center gap-2.5 rounded-full border border-white/40 bg-white/70 px-4 shadow-[0_8px_28px_rgba(0,0,0,0.10)] backdrop-blur-md">
        <Search className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
          aria-label={placeholder}
        />
        {hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </label>
    </div>
  )
}
