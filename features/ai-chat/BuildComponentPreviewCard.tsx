"use client"

import React from "react"
import { Check, Loader2 } from "lucide-react"
import { cn } from "../../app/lib/utils"
import type { AiBuildComponentPreviewEntry } from "../../app/store/ai-build-component-preview-store"

export function BuildComponentPreviewCard({
  entry,
  className,
}: {
  entry: AiBuildComponentPreviewEntry
  className?: string
}) {
  const isSaved = entry.phase === "saved"
  const snippet = entry.contentText.trim()
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-gray-900">
            {entry.title?.trim() || "Component preview"}
          </div>
          {entry.position != null ? (
            <p className="text-[10px] text-gray-500">Position {entry.position}</p>
          ) : null}
        </div>
        {isSaved ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
            <Check className="h-3 w-3" aria-hidden />
            Saved
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Preview
          </span>
        )}
      </div>
      {snippet ? (
        <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-snug text-gray-600 line-clamp-4 break-words [overflow-wrap:anywhere]">
          {snippet}
        </p>
      ) : null}
    </div>
  )
}
