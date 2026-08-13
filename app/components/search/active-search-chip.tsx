'use client'

import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type ActiveSearchChipProps = {
  query: string | null | undefined
  onClear: () => void
  className?: string
}

export function ActiveSearchChip({ query, onClear, className }: ActiveSearchChipProps) {
  const normalizedQuery = query?.trim() ?? ""
  if (!normalizedQuery) return null

  const pillButton =
    "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-1 text-sm font-medium text-gray-700 shadow-none transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"

  return (
    <div className={cn("flex min-w-0", className)}>
      <button
        type="button"
        className={cn(pillButton, "pr-2")}
        onClick={onClear}
        title={`Search: ${normalizedQuery}`}
      >
        <span className="mr-1 shrink-0 capitalize">Search:</span>
        <span className="mr-1 min-w-0 truncate">{normalizedQuery}</span>
        <X className="h-3 w-3 shrink-0 text-gray-400 transition hover:text-destructive" />
      </button>
    </div>
  )
}
