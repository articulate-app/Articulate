"use client"

import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/**
 * Lightweight wrapper around the shared Radix tooltip primitives (the same system the sidebar uses).
 * Wrap a single focusable child (e.g. an icon button or a dropdown trigger) to give it a concise
 * hover/focus label. Relies on an ancestor `TooltipProvider` for delay/behavior — no new tooltip
 * system is introduced.
 */
export function IconTooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string
  side?: "top" | "right" | "bottom" | "left"
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="bg-gray-900 text-gray-100">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
