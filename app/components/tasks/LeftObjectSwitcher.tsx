"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
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

const pillBase =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
const pillActive = "border-gray-900 bg-gray-900 text-white hover:bg-gray-800"
const pillInactive = "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"

export function LeftObjectSwitcher({
  value,
  onChange,
  className,
  containerWidth,
  isTaskView = false,
  forceCompact = false,
}: {
  value: LeftPaneObject
  onChange: (nextValue: LeftPaneObject) => void
  className?: string
  /** Available horizontal space (px) for the switcher; drives the adaptive pill/overflow layout. */
  containerWidth?: number | null
  /** When the left pane is showing tasks, object pills collapse earlier to protect task controls. */
  isTaskView?: boolean
  /** Force the compact single-dropdown layout regardless of width (e.g. mobile header). */
  forceCompact?: boolean
}) {
  const [open, setOpen] = useState(false)

  const state: AdaptiveObjectSwitcherState =
    forceCompact || containerWidth == null
      ? { mode: "dropdown", visibleObjects: [], overflowObjects: [...LEFT_PANE_OBJECTS] }
      : getAdaptiveObjectSwitcherState({ containerWidth, activeObject: value, isTaskView })

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
            className={cn(pillBase, activeInOverflow ? pillActive : pillInactive)}
            aria-label={
              state.mode === "dropdown"
                ? "Switch left pane object"
                : "More object types"
            }
            aria-haspopup="menu"
            aria-expanded={open}
            aria-current={activeInOverflow ? "true" : undefined}
          >
            <span>{state.mode === "dropdown" ? leftPaneObjectLabel(value) : overflowLabel}</span>
            <ChevronDown className="h-4 w-4 opacity-70 stroke-[1.75]" />
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
            className={cn(option === value && "bg-muted font-semibold")}
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

  // Hybrid: visible primary pills + an overflow dropdown for the remaining object types.
  return (
    <div
      role="group"
      aria-label="Switch left pane object"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {state.visibleObjects.map((option) => {
        const isActive = option === value
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-current={isActive ? "true" : undefined}
            className={cn(pillBase, isActive ? pillActive : pillInactive)}
          >
            {leftPaneObjectLabel(option)}
          </button>
        )
      })}
      {overflowMenu}
    </div>
  )
}
