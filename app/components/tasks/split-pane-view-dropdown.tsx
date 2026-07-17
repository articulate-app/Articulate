"use client"

import { Calendar, ChevronDown, LayoutGrid, List } from "lucide-react"
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
}: {
  value: MainViewMode
  primaryView: MainViewMode
  onValueChange: (view: MainViewMode) => void
  pillButton: string
  /** e.g. "Bottom" or "Right" for desktop split panes. Omit on mobile. */
  prefixLabel?: string | null
  className?: string
}) {
  const options = getSplitViewOptions(primaryView)
  const ViewIcon = VIEW_ICONS[value]
  const label = getSplitViewLabel(value)

  return (
    <DropdownMenu>
      <IconTooltip label="Change split view">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(pillButton, "shrink-0 gap-1.5", className)}
            aria-label="Split pane view"
          >
            <ViewIcon className="h-4 w-4" />
            <span>{prefixLabel ? `${prefixLabel}: ${label}` : label}</span>
            <ChevronDown className="h-4 w-4 opacity-70" />
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
