"use client"

import { Bot, Lightbulb, MoreHorizontal } from "lucide-react"
import { IconTooltip } from "./icon-tooltip"
import { cn } from "@/lib/utils"

const actionButtonClass =
  "inline-flex items-center justify-center w-8 h-8 rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"

interface MobileGlobalHeaderActionsProps {
  onOpenAiPane: () => void
  onOpenKeywordResearch: () => void
  onOpenMoreOptions: () => void
  isKeywordResearchOpen?: boolean
  className?: string
}

/**
 * Global mobile header actions — AI pane and Keyword research sit beside the object "..." menu.
 * These are intentionally separate from object-specific options (view mode, filters, group by, etc.).
 */
export function MobileGlobalHeaderActions({
  onOpenAiPane,
  onOpenKeywordResearch,
  onOpenMoreOptions,
  isKeywordResearchOpen = false,
  className,
}: MobileGlobalHeaderActionsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <IconTooltip label="AI pane">
        <button
          type="button"
          onClick={onOpenAiPane}
          className={cn(actionButtonClass, "text-gray-600 hover:bg-gray-100")}
          aria-label="AI pane"
        >
          <Bot className="w-5 h-5" />
        </button>
      </IconTooltip>
      <IconTooltip label="Keyword research">
        <button
          type="button"
          onClick={onOpenKeywordResearch}
          className={cn(
            actionButtonClass,
            isKeywordResearchOpen
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "text-gray-600 hover:bg-gray-100"
          )}
          aria-label="Keyword research"
        >
          <Lightbulb className="w-5 h-5" />
        </button>
      </IconTooltip>
      <IconTooltip label="More options">
        <button
          type="button"
          onClick={onOpenMoreOptions}
          className={cn(actionButtonClass, "text-gray-600 hover:bg-gray-100")}
          aria-label="More options"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </IconTooltip>
    </div>
  )
}
