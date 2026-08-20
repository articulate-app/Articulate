"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  AI_PANE_TAB_ACTIVE_CLASS,
  AI_PANE_TAB_CHIP_CLASS,
  AI_PANE_TAB_INACTIVE_CLASS,
} from "../../../features/ai-chat/tab-strip-tokens"
import {
  LEFT_PANE_OBJECTS,
  getAdaptiveObjectSwitcherState,
  leftPaneObjectLabel,
  type AdaptiveObjectSwitcherState,
  type LeftPaneObject,
} from "../../lib/left-pane-object"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { IconTooltip } from "../ui/icon-tooltip"

export function LeftObjectSwitcher({
  value,
  onChange,
  className,
  containerWidth,
  isTaskView = false,
  forceCompact = false,
  variant = "default",
}: {
  value: LeftPaneObject
  onChange: (nextValue: LeftPaneObject) => void
  className?: string
  /** Available horizontal space (px) for the switcher; drives the adaptive pill/overflow layout. */
  containerWidth?: number | null
  /** Kept for call-site compatibility; pills greedily fit available width on all views. */
  isTaskView?: boolean
  /** Force the compact single-dropdown layout regardless of width (e.g. mobile header). */
  forceCompact?: boolean
  /** `title` renders the active object as a centered page heading (mobile list chrome). */
  variant?: "default" | "title"
}) {
  const [open, setOpen] = useState(false)

  // Prefer measured width from the parent. Treat 0 / null as "unknown" so we don't lock into the
  // compact dropdown when the row hasn't been laid out yet (or was measured while shrink-wrapped).
  const hasMeasuredWidth = typeof containerWidth === "number" && containerWidth > 0
  const state: AdaptiveObjectSwitcherState = forceCompact
    ? { mode: "dropdown", visibleObjects: [], overflowObjects: [...LEFT_PANE_OBJECTS] }
    : hasMeasuredWidth
      ? getAdaptiveObjectSwitcherState({ containerWidth, activeObject: value, isTaskView })
      : // Optimistic hybrid until measurement arrives — avoids a sticky "Tasks ▾" that never expands.
        {
          mode: "hybrid",
          visibleObjects: [...LEFT_PANE_OBJECTS],
          overflowObjects: [],
        }

  const activeInOverflow = state.overflowObjects.includes(value)
  // Overflow trigger shows the active object's label when the selection lives inside the menu, so the
  // selected object is always clearly indicated even when it has no visible pill.
  const overflowLabel = activeInOverflow ? leftPaneObjectLabel(value) : "More"

  const overflowMenu = state.overflowObjects.length > 0 && (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <IconTooltip label={state.mode === "dropdown" ? "Switch object" : "More object types"}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              variant === "title"
                ? "inline-flex max-w-full items-center justify-center gap-0.5 text-[15px] font-semibold tracking-tight text-gray-900"
                : cn(
                    AI_PANE_TAB_CHIP_CLASS,
                    "max-w-none",
                    activeInOverflow ? AI_PANE_TAB_ACTIVE_CLASS : AI_PANE_TAB_INACTIVE_CLASS,
                    "font-normal",
                  ),
            )}
            aria-label={
              state.mode === "dropdown"
                ? "Switch left pane object"
                : "More object types"
            }
            aria-haspopup="menu"
            aria-expanded={open}
            aria-current={activeInOverflow ? "true" : undefined}
          >
            <span className="truncate">
              {state.mode === "dropdown" ? leftPaneObjectLabel(value) : overflowLabel}
            </span>
            <ChevronDown className={cn("shrink-0 opacity-50", variant === "title" ? "h-4 w-4" : "h-3.5 w-3.5")} />
          </button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {state.overflowObjects.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={(event) => {
              event.preventDefault()
              onChange(option)
              setOpen(false)
            }}
            aria-current={option === value ? "true" : undefined}
            className={cn(option === value && "bg-muted font-medium")}
          >
            {leftPaneObjectLabel(option)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // Compact: a single dropdown that mirrors the previous always-condensed behavior.
  if (state.mode === "dropdown") {
    return <div className={cn("inline-flex items-center", className)}>{overflowMenu}</div>
  }

  // Hybrid: visible primary chips + an overflow dropdown for the remaining object types.
  return (
    <div
      role="group"
      aria-label="Switch left pane object"
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {state.visibleObjects.map((option) => {
        const isActive = option === value
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              AI_PANE_TAB_CHIP_CLASS,
              "max-w-none",
              isActive ? AI_PANE_TAB_ACTIVE_CLASS : AI_PANE_TAB_INACTIVE_CLASS,
              "font-normal",
            )}
          >
            <span className="truncate">{leftPaneObjectLabel(option)}</span>
          </button>
        )
      })}
      {overflowMenu}
    </div>
  )
}
