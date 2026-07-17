"use client"

import { MoreHorizontal } from "lucide-react"
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
}: {
  children: React.ReactNode
  visible?: boolean
  align?: "start" | "end"
  triggerClassName?: string
  ariaLabel?: string
}) {
  if (!visible) return null

  return (
    <DropdownMenu>
      <IconTooltip label={ariaLabel}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1",
              triggerClassName,
            )}
            aria-label={ariaLabel}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent align={align} className="min-w-[220px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
