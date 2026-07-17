"use client"

import React from "react"
import { Zap } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip"

export type AIInlineAffordancePlacement = "single-line" | "multiline" | "rich-text"

export interface AIInlineAffordanceProps {
  onZapClick: () => void
  placement?: AIInlineAffordancePlacement
  /** When true, show at higher opacity even when not hovered/focused (e.g. field has content) */
  hasContent?: boolean
  /** Class name for the wrapper. Must include "group" for hover/focus-within visibility. */
  containerClassName?: string
  /** Disabled state (e.g. while AI is loading) */
  disabled?: boolean
}

/**
 * Minimal Zap icon overlay for text fields. Shows on hover/focus/hasContent.
 * Positioned at bottom-right (multiline/rich) or top-right (single-line) with no layout shift.
 * Parent wrapper must have class "group" so that group-hover and group-focus-within work.
 */
export function AIInlineAffordance({
  onZapClick,
  placement = "multiline",
  hasContent = false,
  containerClassName = "",
  disabled = false,
}: AIInlineAffordanceProps) {
  const isTopRight = placement === "single-line"

  const handleZapClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) onZapClick()
  }

  const handleZapMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      className={`absolute z-10 right-1.5 flex h-7 w-7 items-center justify-center rounded text-amber-500 opacity-0 transition-opacity duration-150 group-hover:opacity-70 group-focus-within:opacity-70 hover:!opacity-100 ${hasContent ? "!opacity-50" : ""} ${containerClassName}`}
      style={isTopRight ? { top: 6 } : { bottom: 6 }}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleZapClick}
              onMouseDown={handleZapMouseDown}
              disabled={disabled}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-amber-50 hover:text-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
              aria-label="Build with AI"
            >
              <Zap className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={isTopRight ? "bottom" : "top"} className="text-xs">
            Build with AI
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

/**
 * Padding to add to the content area so text doesn't run under the Zap icon.
 * Apply to the inner content (e.g. .ql-editor or the input wrapper).
 */
export const AI_INLINE_AFFORDANCE_PADDING = { paddingRight: 36, paddingBottom: 8 }
