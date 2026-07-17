"use client"

import * as React from "react"
import { ChevronLeft, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu"

/**
 * A single action surfaced in a mobile detail view's top-right overflow ("...") menu. Actions reuse
 * the same handlers as their desktop counterparts so behavior, state, and URL updates stay identical.
 */
export type MobileDetailAction = {
  id: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
  /** Render a divider above this item (used to group destructive actions). */
  separatorBefore?: boolean
}

/**
 * Standalone overflow menu — a top-right "..." trigger that reveals `actions`. Use this when a detail
 * view already owns its header layout and only needs the consolidated action menu (e.g. TaskDetails).
 */
export function ObjectActionsOverflow({
  actions,
  align = "end",
  triggerClassName,
  ariaLabel = "More actions",
}: {
  actions: MobileDetailAction[]
  align?: "start" | "center" | "end"
  triggerClassName?: string
  ariaLabel?: string
}) {
  if (actions.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500",
            triggerClassName,
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[12rem]">
        {actions.map((action) => (
          <React.Fragment key={action.id}>
            {action.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={action.disabled}
              onClick={action.onSelect}
              className={cn(action.destructive && "text-red-600 focus:text-red-600")}
            >
              {action.icon ? (
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">{action.icon}</span>
              ) : null}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Consistent mobile detail header: a left back button, a stable (truncating) title/subtitle block, an
 * optional inline `rightSlot` for high-frequency controls, and a top-right "..." overflow menu. The
 * title always occupies the same position regardless of how many actions exist so it never shifts
 * between object types.
 */
export function MobileDetailHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  actions = [],
  rightSlot,
  leadingSlot,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onBack?: () => void
  backLabel?: string
  actions?: MobileDetailAction[]
  rightSlot?: React.ReactNode
  /** Optional identity marker (e.g. avatar) shown before the title block. */
  leadingSlot?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex min-h-12 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2 py-1",
        className,
      )}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}
      {leadingSlot ? <div className="shrink-0">{leadingSlot}</div> : null}
      <div className="min-w-0 flex-1 px-1">
        <h1 className="truncate text-sm font-semibold text-gray-900">{title}</h1>
        {subtitle ? <div className="truncate text-xs text-gray-500">{subtitle}</div> : null}
      </div>
      {rightSlot}
      <ObjectActionsOverflow actions={actions} />
    </header>
  )
}
