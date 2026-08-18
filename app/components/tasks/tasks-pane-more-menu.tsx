"use client"

import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { IconTooltip } from "../ui/icon-tooltip"

/** Shared "…" overflow trigger used by desktop and mobile split task panes. */
export function TasksPaneMoreMenu({
  children,
  visible = true,
  align = "end",
  triggerClassName,
  ariaLabel = "More actions",
  triggerIcon = "more",
}: {
  children: React.ReactNode
  visible?: boolean
  align?: "start" | "end"
  triggerClassName?: string
  ariaLabel?: string
  triggerIcon?: "more" | "sort"
}) {
  if (!visible) return null

  return (
    <DropdownMenu>
      <IconTooltip label={ariaLabel}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1",
              triggerClassName,
            )}
            aria-label={ariaLabel}
          >
            {triggerIcon === "sort" ? (
              <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent align={align} className="min-w-[220px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
