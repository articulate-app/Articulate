"use client"

import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { MOBILE_CIRCLE_BUTTON_CLASS } from "./mobile-app-header"

interface MobileGlobalHeaderActionsProps {
  onOpenAiPane: () => void
  onOpenKeywordResearch: () => void
  onOpenMoreOptions: () => void
  isKeywordResearchOpen?: boolean
  className?: string
}

/**
 * Overflow trigger for mobile list chrome. AI, Research, and view controls live in the options sheet.
 */
export function MobileGlobalHeaderActions({
  onOpenMoreOptions,
  className,
}: MobileGlobalHeaderActionsProps) {
  return (
    <div className={cn("flex items-center", className)}>
      <button
        type="button"
        onClick={onOpenMoreOptions}
        className={MOBILE_CIRCLE_BUTTON_CLASS}
        aria-label="More options"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </div>
  )
}
