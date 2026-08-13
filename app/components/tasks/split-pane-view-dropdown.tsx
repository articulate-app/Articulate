"use client"

import { ChevronDown, LayoutGrid, List, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { IconTooltip } from "../ui/icon-tooltip"
import type { MainViewMode } from "./tasks-pane-toolbar"
import { getSplitViewLabel, getSplitViewOptions } from "../../lib/split-pane-view"

const VIEW_ICONS: Record<MainViewMode, typeof List> = {
  list: List,
  calendar: Calendar,
  kanban: LayoutGrid,
}

export function SplitPaneViewDropdown({
  value,
  primaryView,
  onValueChange,
  pillButton,
  prefixLabel,
  className,
  iconOnly = false,
}: {
  value: MainViewMode
  primaryView: MainViewMode
  onValueChange: (view: MainViewMode) => void
  pillButton: string
  /** e.g. "Bottom" or "Right" for desktop split panes. Omit on mobile. */
  prefixLabel?: string | null
  className?: string
  /** Compact icon trigger (no “List” / “Kanban” label). */
  iconOnly?: boolean
}) {
  const options = getSplitViewOptions(primaryView)
  const label = getSplitViewLabel(value)

  return (
    <DropdownMenu>
      <IconTooltip label={prefixLabel ? `${prefixLabel}: ${label}` : `View: ${label}`}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              iconOnly
                ? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                : cn(pillButton, "shrink-0 gap-1.5"),
              className,
            )}
            aria-label={prefixLabel ? `${prefixLabel} view: ${label}` : `Split pane view: ${label}`}
          >
            <LayoutGrid className={iconOnly ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {iconOnly ? null : (
              <>
                <span>{prefixLabel ? `${prefixLabel}: ${label}` : label}</span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {options.map((option) => {
          const OptionIcon = VIEW_ICONS[option]
          return (
            <DropdownMenuItem
              key={option}
              onClick={() => onValueChange(option)}
              className={value === option ? "font-semibold bg-muted" : ""}
            >
              <OptionIcon className="mr-2 h-4 w-4" />
              {getSplitViewLabel(option)}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
